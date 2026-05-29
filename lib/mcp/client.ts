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

export class McpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authToken: string | undefined,
    private readonly label: "lp" | "hl",
  ) {}

  async call<T>(toolName: string, opts: CallOpts = {}): Promise<T> {
    if (!this.baseUrl) {
      const msg = `${this.label.toUpperCase()} MCP base URL missing. Set ${this.label.toUpperCase()}_MCP_URL in env.`;
      this.logError(toolName, null, 0, msg);
      throw new McpError(msg, 0, toolName);
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
        throw new McpError(
          `${this.label.toUpperCase()} MCP ${toolName} returned an error: ${(text ?? "isError").slice(0, 200)}`,
          0,
          toolName,
        );
      }
      if (text === null) {
        throw new McpError(
          `${this.label.toUpperCase()} MCP ${toolName} returned no text content`,
          0,
          toolName,
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new McpError(
          `${this.label.toUpperCase()} MCP ${toolName} returned non-JSON content: ${text.slice(0, 200)}`,
          0,
          toolName,
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logError(toolName, endpoint.toString(), Date.now() - startedAt, error);
      if (e instanceof McpError) throw e;
      throw new McpError(
        `${this.label.toUpperCase()} MCP ${toolName} call failed: ${error}`,
        0,
        toolName,
      );
    } finally {
      await client.close().catch(() => {});
    }
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
  ) {
    super(message);
    this.name = "McpError";
  }
}
