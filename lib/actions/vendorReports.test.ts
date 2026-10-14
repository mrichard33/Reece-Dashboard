import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The gates on the vendor-report actions. Hiding a button is a courtesy;
 * these checks are what keeps a non-admin from taking a vendor live.
 */

const getAccessContext = vi.fn();
const update = vi.fn();
const insert = vi.fn();
let current: { id: number; dry_run: boolean; is_active: boolean; notes: string | null } | null = null;

vi.mock("@/lib/auth", () => ({ getAccessContext: () => getAccessContext() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/lp", () => ({
  lpService: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }) }),
      update: (patch: unknown) => ({ eq: async () => { update(patch); return { error: null }; } }),
      insert: async (row: unknown) => { insert(row); return { error: null }; },
    }),
  }),
}));

const ctx = (over: Record<string, unknown> = {}) => ({
  email: "r.lymych@reecewindows.com", role: "operator", isAdmin: false,
  executive: { name: "Roman" }, isExecutive: true, isExecOnly: false, ...over,
});
const base = { id: 1, recipients_to: "vendor@x.com", recipients_cc: "", rev_share: false, is_active: true, dry_run: true };

async function subject() {
  return await import("./vendorReports");
}

beforeEach(() => {
  vi.resetModules();
  getAccessContext.mockReset();
  update.mockReset();
  insert.mockReset();
  current = { id: 1, dry_run: true, is_active: true, notes: "seed" };
});

describe("saveVendorReport", () => {
  it("refuses a signed-out caller and writes nothing", async () => {
    getAccessContext.mockResolvedValue(null);
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport(base)).toMatchObject({ ok: false, code: "not_operator" });
    expect(update).not.toHaveBeenCalled();
  });
  it("refuses a 'team' role", async () => {
    getAccessContext.mockResolvedValue(ctx({ role: "team" }));
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport(base)).toMatchObject({ ok: false, code: "not_operator" });
  });
  it("lets an operator save emails, CC, rev share and on/off", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    const res = await saveVendorReport({ ...base, recipients_to: "A@x.com, b@y.com", recipients_cc: "c@z.com", rev_share: true, is_active: false });
    expect(res).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      recipients_to: ["a@x.com", "b@y.com"], recipients_cc: ["c@z.com"], rev_share: true, is_active: false, dry_run: true,
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("notes");
  });
  it("refuses a non-admin who tries to switch dry run off, and writes nothing", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, dry_run: false })).toMatchObject({ ok: false, code: "not_admin" });
    expect(update).not.toHaveBeenCalled();
  });
  it("lets the admin switch dry run off and records who did it after the existing note", async () => {
    getAccessContext.mockResolvedValue(ctx({ isAdmin: true, executive: { name: "Mark" } }));
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, dry_run: false })).toEqual({ ok: true });
    const patch = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.dry_run).toBe(false);
    expect(String(patch.notes)).toMatch(/^seed \| dry_run=false by Mark \d{4}-\d{2}-\d{2}$/);
  });
  it("refuses to take a vendor live with no To email", async () => {
    getAccessContext.mockResolvedValue(ctx({ isAdmin: true }));
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, recipients_to: "", dry_run: false })).toMatchObject({ ok: false, code: "invalid" });
    expect(update).not.toHaveBeenCalled();
  });
  it("names a bad address instead of saving part of the list", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    const res = await saveVendorReport({ ...base, recipients_to: "ok@x.com, nope" });
    expect(res).toMatchObject({ ok: false, code: "invalid" });
    expect(res.error).toContain("nope");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("addVendorReport", () => {
  it("always starts a new vendor in dry run and needs a name and a sub-source", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { addVendorReport } = await subject();
    expect(await addVendorReport({ vendor_name: " ", lp_sub_sources: "X", recipients_to: "", rev_share: false, is_active: true })).toMatchObject({ code: "invalid" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "", recipients_to: "", rev_share: false, is_active: true })).toMatchObject({ code: "invalid" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "Porch101", recipients_to: "p@porch.com", rev_share: true, is_active: true })).toEqual({ ok: true });
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ vendor_name: "Porch101", lp_sub_sources: ["Porch101"], recipients_to: ["p@porch.com"], rev_share: true, is_active: true, dry_run: true });
  });
  it("refuses a non-operator", async () => {
    getAccessContext.mockResolvedValue(ctx({ role: "team" }));
    const { addVendorReport } = await subject();
    expect(await addVendorReport({ vendor_name: "X", lp_sub_sources: "X", recipients_to: "", rev_share: false, is_active: true })).toMatchObject({ code: "not_operator" });
    expect(insert).not.toHaveBeenCalled();
  });
});
