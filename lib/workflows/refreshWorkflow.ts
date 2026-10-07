/**
 * "Refresh from GHL" on /workflows/[id] (2026-10-07).
 *
 * On 2026-10-07 the page drew F.0 at v108 while GHL was on v118: HL-MCP's
 * hourly sync had been refused a GHL login token since 8 AM and rebuilt no
 * steps, so eight messages GHL had turned back on still read "turned off in
 * GHL". This lets whoever is looking pull the one workflow fresh instead of
 * waiting for the next sync. It calls HL-MCP's own refresh_workflow, the same
 * code the nightly pass runs, so there is one way the cache gets rebuilt.
 */
import type { HlRefreshWorkflowResult } from "@/lib/mcp/hlClient";

export type RefreshOutcome =
  | { status: 200; body: { ok: true; version: number | null; stepsRebuilt: true; steps: number | null } }
  | { status: 200; body: { ok: false; version: number | null; stepsRebuilt: false; error: string } }
  | { status: 400 | 502; body: { ok: false; error: string } };

/** GHL workflow ids are UUIDs; anything else never reaches HL-MCP. */
export function isWorkflowId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function refreshWorkflowFromGhl(
  id: string,
  deps: { refresh: (id: string) => Promise<HlRefreshWorkflowResult>; invalidate: (id: string) => void },
): Promise<RefreshOutcome> {
  if (!isWorkflowId(id)) return { status: 400, body: { ok: false, error: "Not a GHL workflow id." } };
  let r: HlRefreshWorkflowResult;
  try {
    r = await deps.refresh(id);
  } catch (e) {
    return { status: 502, body: { ok: false, error: e instanceof Error ? e.message : "HL-MCP did not answer." } };
  }
  const version = typeof r.version === "number" ? r.version : null;
  // Even a failed rebuild may have moved the version/status row, so the page
  // re-reads either way.
  deps.invalidate(id);
  if (r.steps_rebuilt !== true || (r.detail_errors?.length ?? 0) > 0) {
    const why = r.steps_rebuilt !== true ? (r.steps_rebuilt_reason ?? "GHL did not return the steps") : r.detail_errors!.slice(0, 2).join("; ");
    return { status: 200, body: { ok: false, version, stepsRebuilt: false, error: `Couldn't read the steps from GHL (${why}).` } };
  }
  return { status: 200, body: { ok: true, version, stepsRebuilt: true, steps: typeof r.steps_synced === "number" ? r.steps_synced : null } };
}
