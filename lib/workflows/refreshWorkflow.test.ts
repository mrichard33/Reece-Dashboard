import { describe, expect, it, vi } from "vitest";
import { isWorkflowId, refreshWorkflowFromGhl } from "./refreshWorkflow";

const ID = "15f47572-9ffc-453d-995d-a1890441f290";

describe("refreshWorkflowFromGhl", () => {
  it("refuses anything that is not a workflow id, without calling HL-MCP", async () => {
    const refresh = vi.fn();
    const out = await refreshWorkflowFromGhl("../etc", { refresh, invalidate: vi.fn() });
    expect(out.status).toBe(400);
    expect(refresh).not.toHaveBeenCalled();
    expect(isWorkflowId(ID)).toBe(true);
  });

  it("reports the new version and drops the cached graph after a clean rebuild", async () => {
    const invalidate = vi.fn();
    const out = await refreshWorkflowFromGhl(ID, {
      refresh: async () => ({ version: 118, steps_rebuilt: true, steps_synced: 208, detail_errors: [] }),
      invalidate,
    });
    expect(out).toEqual({ status: 200, body: { ok: true, version: 118, stepsRebuilt: true, steps: 208 } });
    expect(invalidate).toHaveBeenCalledWith(ID);
  });

  // 2026-10-07: a deep read GHL refused leaves the old steps; say so, never "updated".
  it("says plainly when GHL did not return the steps", async () => {
    const out = await refreshWorkflowFromGhl(ID, {
      refresh: async () => ({ version: 118, steps_rebuilt: false, steps_rebuilt_reason: "shallow_source" }),
      invalidate: vi.fn(),
    });
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(false);
    expect(out.body).toMatchObject({ stepsRebuilt: false });
    expect((out.body as { error: string }).error).toContain("shallow_source");
  });

  it("is a 502 when HL-MCP cannot be reached, and touches no cache", async () => {
    const invalidate = vi.fn();
    const out = await refreshWorkflowFromGhl(ID, { refresh: async () => { throw new Error("timeout"); }, invalidate });
    expect(out).toEqual({ status: 502, body: { ok: false, error: "timeout" } });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
