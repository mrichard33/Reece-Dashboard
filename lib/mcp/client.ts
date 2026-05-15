/**
 * Generic MCP-over-HTTP client.
 *
 * Both LP and HL MCP services expose tool endpoints at:
 *   GET  /tools/<name>?<query>   for read tools
 *   POST /tools/<name>           with JSON body for write/action tools
 *
 * Authentication is via Bearer token in the Authorization header (only sent
 * when the configured token is a non-empty string).
 *
 * Every call has a 10s timeout so a hung MCP never blocks an RSC render.
 */

type CallOpts = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  revalidate?: number; // seconds; passed to fetch cache
  signal?: AbortSignal;
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
      console.error(
        "[mcp]",
        JSON.stringify({
          label: this.label,
          tool: toolName,
          url: null,
          method: opts.method ?? "GET",
          status: 0,
          durationMs: 0,
          error: msg,
        }),
      );
      throw new McpError(msg, 0, toolName);
    }
    const url = new URL(`/tools/${toolName}`, this.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (typeof this.authToken === "string" && this.authToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.authToken.trim()}`;
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    // Internal 10s timeout, optionally combined with a caller-provided signal.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }

    const init: RequestInit & { next?: { revalidate?: number } } = {
      method: opts.method ?? "GET",
      headers,
      signal: ctrl.signal,
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (opts.revalidate !== undefined) init.next = { revalidate: opts.revalidate };

    const urlStr = url.toString();
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(urlStr, init);
    } catch (e) {
      const isTimeout = ctrl.signal.aborted && !(opts.signal?.aborted ?? false);
      const error = isTimeout
        ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : String(e);
      console.error(
        "[mcp]",
        JSON.stringify({
          label: this.label,
          tool: toolName,
          url: urlStr,
          method: init.method,
          status: 0,
          durationMs: Date.now() - startedAt,
          error,
        }),
      );
      throw new McpError(
        `${this.label.toUpperCase()} MCP ${toolName} fetch failed: ${error}`,
        0,
        toolName,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[mcp]",
        JSON.stringify({
          label: this.label,
          tool: toolName,
          url: urlStr,
          method: init.method,
          status: res.status,
          durationMs: Date.now() - startedAt,
          error: `HTTP ${res.status}`,
          bodyPreview: text.slice(0, 200),
        }),
      );
      throw new McpError(
        `${this.label.toUpperCase()} MCP ${toolName} failed (${res.status}): ${text.slice(0, 200)}`,
        res.status,
        toolName,
      );
    }
    return (await res.json()) as T;
  }
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
