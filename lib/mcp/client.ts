/**
 * MCP client over Streamable HTTP.
 *
 * The LP and HL services expose their tools via the MCP protocol at
 *   POST <baseUrl>/mcp
 * (StreamableHTTP transport — JSON-RPC with an `initialize` handshake and an
 * `mcp-session-id`). They do NOT expose a REST `/tools/<name>` surface, so we
 * speak MCP directly with the official SDK rather than plain fetch.
 *
 * A static Bearer token is sent when configured (it must match each server's
 * MCP_AUTH_TOKEN). Every call is bounded by a 10s timeout so a hung or
 * unreachable MCP never blocks an RSC render — failures surface as McpError,
 * which callers degrade into a "status unavailable" tile.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type CallOpts = {
  /** Tool arguments. Defaults to `{}` (most dashboard tools take none). */
  args?: Record<string, unknown>;
  /**
   * Per-call timeout override. Defaults to DEFAULT_TIMEOUT_MS. Sync triggers
   * pass a higher ceiling since kicking off a sync can take longer than a read.
   */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * How an MCP call failed, so the UI can render an actionable tile instead of a
 * raw transport dump:
 *   auth        — the server rejected the Bearer token (401 / unauthorized).
 *   unreachable — couldn't connect (DNS, ECONN, missing base URL, fetch failure).
 *   timeout     — the SDK request exceeded its per-call ceiling.
 *   tool        — the tool ran but returned an error / non-JSON / empty content.
 *   unknown     — anything else.
 */
export type McpErrorKind = "auth" | "unreachable" | "timeout" | "tool" | "unknown";

/** Classify a raw error string into an McpErrorKind (see McpErrorKind doc). */
export function classifyMcpError(raw: string): McpErrorKind {
  if (/unauthorized|bearer token|\b401\b|forbidden|\b403\b/i.test(raw)) return "auth";
  if (/timed out|timeout|etimedout|deadline exceeded/i.test(raw)) return "timeout";
  if (
    /econnrefused|econnreset|enotfound|eai_again|getaddrinfo|fetch failed|network|socket hang up|unreachable|base url missing/i.test(
      raw,
    )
  )
    return "unreachable";
  return "unknown";
}

/** Human label per client, used in actionable auth messages. */
function clientLabel(label: "lp" | "hl"): string {
  return label === "lp" ? "LP MCP" : "HL MCP";
}

/** Env var the dashboard must set to authenticate against this MCP service. */
function clientTokenEnv(label: "lp" | "hl"): string {
  return label === "lp" ? "LP_MCP_AUTH_TOKEN" : "HL_MCP_AUTH_TOKEN";
}

export class McpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authToken: string | undefined,
    private readonly label: "lp" | "hl",
  ) {}

  async call<T>(toolName: string, opts: CallOpts = {}): Promise<T> {
    if (!this.baseUrl) {
      const msg = `${clientLabel(this.label)} base URL missing. Set ${this.label.toUpperCase()}_MCP_URL on the Dashboard Railway service.`;
      this.logError(toolName, null, 0, msg);
      throw new McpError(msg, 0, toolName, "unreachable");
    }

    const endpoint = new URL("/mcp", this.baseUrl);
    const headers: Record<string, string> = {};
    if (typeof this.authToken === "string" && this.authToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.authToken.trim()}`;
    }

    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers },
    });
    const client = new Client(
      { name: "antifragile-mission-control", version: "0.1.0" },
      { capabilities: {} },
    );

    const startedAt = Date.now();
    try {
      await client.connect(transport);
      const res = await client.callTool(
        { name: toolName, arguments: opts.args ?? {} },
        undefined,
        { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );

      const text = firstText(res.content);

      if (res.isError) {
        // A tool that ran but reported failure — but the server may also surface
        // a 401 as an isError result, so classify the text before labelling.
        const raw = text ?? "isError";
        const kind = classifyMcpError(raw);
        throw new McpError(
          kind === "auth"
            ? this.authMessage()
            : `${clientLabel(this.label)} ${toolName} returned an error: ${raw.slice(0, 200)}`,
          0,
          toolName,
          kind === "auth" ? "auth" : "tool",
        );
      }
      if (text === null) {
        throw new McpError(
          `${clientLabel(this.label)} ${toolName} returned no text content`,
          0,
          toolName,
          "tool",
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new McpError(
          `${clientLabel(this.label)} ${toolName} returned non-JSON content: ${text.slice(0, 200)}`,
          0,
          toolName,
          "tool",
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logError(toolName, endpoint.toString(), Date.now() - startedAt, error);
      if (e instanceof McpError) throw e;
      const kind = classifyMcpError(error);
      throw new McpError(
        kind === "auth"
          ? this.authMessage()
          : `${clientLabel(this.label)} ${toolName} call failed: ${error}`,
        0,
        toolName,
        kind,
      );
    } finally {
      await client.close().catch(() => {});
    }
  }

  /** Actionable message for a rejected Bearer token — points the operator at the fix. */
  private authMessage(): string {
    return `${clientLabel(this.label)} rejected the request (401). Set ${clientTokenEnv(
      this.label,
    )} on the Dashboard Railway service to match the ${clientLabel(
      this.label,
    )} service's MCP_AUTH_TOKEN, then redeploy.`;
  }

  private logError(tool: string, url: string | null, durationMs: number, error: string) {
    console.error(
      "[mcp]",
      JSON.stringify({
        label: this.label,
        tool,
        url,
        transport: "streamable-http",
        durationMs,
        error,
      }),
    );
  }
}

/** Pull the first text block out of an MCP tool result's content array. */
function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string"
    ) {
      return (item as { text: string }).text;
    }
  }
  return null;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly tool: string,
    public readonly kind: McpErrorKind = "unknown",
  ) {
    super(message);
    this.name = "McpError";
  }
}
