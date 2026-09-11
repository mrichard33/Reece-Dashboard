import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The admin gate on the server action.
 *
 * Hiding the buttons from a non-admin is a courtesy; THIS is the gate. A
 * non-admin who reaches the action — a stale tab, a hand-rolled POST, a shared
 * screen — must be refused before anything reaches LP MCP, and memory_rule must
 * not be called at all.
 */

const getAccessContext = vi.fn();
const ruleCall = vi.fn();

vi.mock("@/lib/auth", () => ({ getAccessContext: () => getAccessContext() }));
vi.mock("@/lib/mcp/lpClient", () => ({ lpMcp: { rule: (a: unknown) => ruleCall(a) } }));
vi.mock("@/lib/mcp/client", () => ({ McpError: class McpError extends Error { kind = "unknown"; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ctx = (over: Record<string, unknown> = {}) => ({
  email: "mark@reece.com", role: "operator", isAdmin: true,
  executive: null, isExecutive: true, isExecOnly: false, ...over,
});

async function subject() {
  return (await import("./commandCenter")).rule;
}

beforeEach(() => {
  vi.resetModules();
  getAccessContext.mockReset();
  ruleCall.mockReset();
  ruleCall.mockResolvedValue({ ok: true, ruling_id: 1, session_id: 2 });
});

describe("rule() access", () => {
  it("refuses a signed-out caller and calls memory_rule not at all", async () => {
    getAccessContext.mockResolvedValue(null);
    const rule = await subject();
    const res = await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 } });
    expect(res).toMatchObject({ ok: false, code: "not_admin" });
    expect(ruleCall).not.toHaveBeenCalled();
  });

  it("refuses a 'team' role", async () => {
    getAccessContext.mockResolvedValue(ctx({ role: "team" }));
    const rule = await subject();
    const res = await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 } });
    expect(res).toMatchObject({ ok: false, code: "not_admin" });
    expect(ruleCall).not.toHaveBeenCalled();
  });

  it("refuses a non-admin operator — read-only means read-only", async () => {
    getAccessContext.mockResolvedValue(ctx({ isAdmin: false }));
    const rule = await subject();
    const res = await rule({ action: "reject", target: { table: "claude_pending_items", id: 1 }, reason: "no" });
    expect(res).toMatchObject({ ok: false, code: "not_admin" });
    expect(ruleCall).not.toHaveBeenCalled();
  });

  it("lets an admin through and stamps the ruling with their email", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const rule = await subject();
    const res = await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 } });
    expect(res.ok).toBe(true);
    expect(ruleCall).toHaveBeenCalledTimes(1);
    expect(ruleCall.mock.calls[0]?.[0]).toMatchObject({
      action: "approve",
      ruled_by: "mark@reece.com",
    });
  });

  it("drops empty and undefined fields rather than sending them as arguments", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const rule = await subject();
    await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 }, reason: "", text: undefined });
    const sent = ruleCall.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("reason");
    expect(sent).not.toHaveProperty("text");
  });

  it("passes a guard_conflict straight back so the page can ask the question", async () => {
    getAccessContext.mockResolvedValue(ctx());
    ruleCall.mockResolvedValue({ ok: false, code: "guard_conflict", match: { id: 412, text: "x", similarity: 0.91 } });
    const rule = await subject();
    const res = await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 } });
    expect(res).toMatchObject({ ok: false, code: "guard_conflict" });
    if (!res.ok) expect(res.match?.id).toBe(412);
  });

  it("a transport failure promises nothing was changed", async () => {
    getAccessContext.mockResolvedValue(ctx());
    ruleCall.mockRejectedValue(new Error("fetch failed"));
    const rule = await subject();
    const res = await rule({ action: "approve", target: { table: "claude_pending_items", id: 1 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/fetch failed/);
  });
});
