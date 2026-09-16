import { McpError } from "@/lib/mcp/client";
import type { ConnectorGroup, ConnectorState, ConnectorStatus } from "./types";
import { isConnectorState } from "./types";

/**
 * Run one reachability check and ALWAYS resolve to a ConnectorStatus.
 *
 *   fn resolves  → that state (validated; anything else becomes `unknown`)
 *   fn throws    → `error`, with the actionable message the MCP client already
 *                  produces when it is an McpError (auth / unreachable / …)
 *   fn hangs     → `unknown` after timeoutMs. Never green on "no answer".
 *
 * `runAll` uses Promise.allSettled so a rejection in one probe can never drop
 * another service's row from the grid.
 */

export type ProbeResult = {
  state: ConnectorState;
  detail: string;
  meta?: ConnectorStatus["meta"];
};

export type ProbeSpec = {
  id: string;
  name: string;
  group: ConnectorGroup;
  fn: () => Promise<ProbeResult>;
  timeoutMs?: number;
};

export const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

const TIMED_OUT = Symbol("timed_out");

export async function probe(spec: ProbeSpec): Promise<ConnectorStatus> {
  const timeoutMs = spec.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const started = Date.now();
  const base = { id: spec.id, name: spec.name, group: spec.group };
  const finish = (
    state: ConnectorState,
    detail: string,
    extra: Partial<ConnectorStatus> = {},
  ): ConnectorStatus => ({
    ...base,
    state,
    detail,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    ...extra,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve().then(spec.fn), timeout]);
    if (result === TIMED_OUT) {
      return finish("unknown", `No answer within ${Math.round(timeoutMs / 1000)}s.`);
    }
    const state = isConnectorState(result.state) ? result.state : "unknown";
    return finish(state, result.detail, result.meta ? { meta: result.meta } : {});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const kind = e instanceof McpError ? e.kind : undefined;
    return finish("error", message.slice(0, 300), kind ? { meta: { kind } } : {});
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runAll(specs: ProbeSpec[]): Promise<ConnectorStatus[]> {
  const settled = await Promise.allSettled(specs.map((s) => probe(s)));
  return specs.map((spec, i) => {
    const s = settled[i];
    if (s?.status === "fulfilled") return s.value;
    const reason = s?.status === "rejected" ? s.reason : undefined;
    return {
      id: spec.id,
      name: spec.name,
      group: spec.group,
      state: "unknown" as const,
      detail: reason instanceof Error ? reason.message : String(reason ?? "probe did not settle"),
      checkedAt: new Date().toISOString(),
    };
  });
}
