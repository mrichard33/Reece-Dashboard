import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The gates on the vendor-report actions. Hiding a button is a courtesy;
 * these checks are the gate. Dry run is retired from the page (Mark,
 * 2026-10-14): every save writes dry_run=false and a vendor that is on needs
 * an email, so nothing is ever "on" and silently going nowhere.
 */

const getAccessContext = vi.fn();
const update = vi.fn();
const insert = vi.fn();
const del = vi.fn();
let current: { id: number; vendor_name?: string; dry_run: boolean; is_active: boolean; notes: string | null } | null = null;

vi.mock("@/lib/auth", () => ({ getAccessContext: () => getAccessContext() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/lp", () => ({
  lpService: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }) }),
      update: (patch: unknown) => ({ eq: async () => { update(patch); return { error: null }; } }),
      insert: async (row: unknown) => { insert(row); return { error: null }; },
      delete: () => ({ eq: async (col: string, id: number) => { del(col, id); return { error: null }; } }),
    }),
  }),
}));

const ctx = (over: Record<string, unknown> = {}) => ({
  email: "r.lymych@reecewindows.com", role: "operator", isAdmin: false,
  executive: { name: "Roman" }, isExecutive: true, isExecOnly: false, ...over,
});
const base = { id: 1, recipients_to: "vendor@x.com", recipients_cc: "", rev_share: false, is_active: true };

async function subject() {
  return await import("./vendorReports");
}

beforeEach(() => {
  vi.resetModules();
  getAccessContext.mockReset();
  update.mockReset();
  insert.mockReset();
  del.mockReset();
  current = { id: 1, vendor_name: "Modernize", dry_run: false, is_active: true, notes: "seed" };
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
      recipients_to: ["a@x.com", "b@y.com"], recipients_cc: ["c@z.com"], rev_share: true, is_active: false, dry_run: false,
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("notes");
  });
  it("retires dry run on a row still in it and records who did it after the existing note", async () => {
    getAccessContext.mockResolvedValue(ctx({ executive: { name: "Roman" } }));
    current = { id: 1, vendor_name: "Modernize", dry_run: true, is_active: true, notes: "seed" };
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport(base)).toEqual({ ok: true });
    const patch = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.dry_run).toBe(false);
    expect(String(patch.notes)).toMatch(/^seed \| dry_run=false by Roman \d{4}-\d{2}-\d{2} \(dry run retired\)$/);
  });
  it("refuses a vendor that is on with no To email", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, recipients_to: "" })).toMatchObject({ ok: false, code: "invalid" });
    expect(update).not.toHaveBeenCalled();
    // Off with no email is fine: nothing is sent.
    expect(await saveVendorReport({ ...base, recipients_to: "", is_active: false })).toEqual({ ok: true });
  });
  it("saves the hidden-copy list and names a bad BCC address", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, recipients_bcc: "B.Codman@reecewindows.com, m.richard@reecewindows.com" })).toEqual({ ok: true });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ recipients_bcc: ["b.codman@reecewindows.com", "m.richard@reecewindows.com"] });
    expect(await saveVendorReport({ ...base, recipients_bcc: "nope" })).toMatchObject({ ok: false, code: "invalid" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(await saveVendorReport(base)).toEqual({ ok: true });
    expect(update.mock.calls[1]?.[0]).not.toHaveProperty("recipients_bcc");
  });
  it("saves the report frequency and refuses anything but weekly or monthly", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, frequency: "monthly" })).toEqual({ ok: true });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ frequency: "monthly" });
    expect(await saveVendorReport({ ...base, frequency: "daily" })).toMatchObject({ ok: false, code: "invalid" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(await saveVendorReport(base)).toEqual({ ok: true });
    expect(update.mock.calls[1]?.[0]).not.toHaveProperty("frequency");
  });
  it("names a bad address instead of saving part of the list", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    const res = await saveVendorReport({ ...base, recipients_to: "ok@x.com, nope" });
    expect(res).toMatchObject({ ok: false, code: "invalid" });
    expect(res.error).toContain("nope");
    expect(update).not.toHaveBeenCalled();
  });
  it("leaves the sub-sources alone when the field is not sent", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport(base)).toEqual({ ok: true });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("lp_sub_sources");
  });
  it("saves an edited sub-source list, parsed like a new vendor's", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, lp_sub_sources: " Bing PPC,\nGoogle, bing ppc" })).toEqual({ ok: true });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ lp_sub_sources: ["Bing PPC", "Google"] });
  });
  it("refuses to empty the sub-source list: a vendor with none matches no lead", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { saveVendorReport } = await subject();
    expect(await saveVendorReport({ ...base, lp_sub_sources: " , " })).toMatchObject({ ok: false, code: "invalid" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("deleteVendorReport", () => {
  it("refuses a non-operator and deletes nothing", async () => {
    getAccessContext.mockResolvedValue(ctx({ role: "team" }));
    const { deleteVendorReport } = await subject();
    expect(await deleteVendorReport({ id: 1 })).toMatchObject({ ok: false, code: "not_operator" });
    expect(del).not.toHaveBeenCalled();
  });
  it("lets an operator delete a vendor by id", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { deleteVendorReport } = await subject();
    expect(await deleteVendorReport({ id: 1 })).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith("id", 1);
  });
  it("says so when the vendor is already gone", async () => {
    getAccessContext.mockResolvedValue(ctx());
    current = null;
    const { deleteVendorReport } = await subject();
    expect(await deleteVendorReport({ id: 7 })).toMatchObject({ ok: false, code: "invalid" });
    expect(del).not.toHaveBeenCalled();
  });
});

describe("addVendorReport", () => {
  it("starts a new vendor live (no dry run), weekly by default, and needs a name and a sub-source", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { addVendorReport } = await subject();
    expect(await addVendorReport({ vendor_name: " ", lp_sub_sources: "X", recipients_to: "", rev_share: false, is_active: false })).toMatchObject({ code: "invalid" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "", recipients_to: "", rev_share: false, is_active: false })).toMatchObject({ code: "invalid" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "Porch101", recipients_to: "p@porch.com", rev_share: true, is_active: false })).toEqual({ ok: true });
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ vendor_name: "Porch101", lp_sub_sources: ["Porch101"], recipients_to: ["p@porch.com"], rev_share: true, is_active: false, dry_run: false, frequency: "weekly" });
  });
  it("takes a monthly frequency, refuses a bad one, and refuses on-with-no-email", async () => {
    getAccessContext.mockResolvedValue(ctx());
    const { addVendorReport } = await subject();
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "Porch101", recipients_to: "p@porch.com", rev_share: false, is_active: false, frequency: "monthly" })).toEqual({ ok: true });
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ frequency: "monthly" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "Porch101", recipients_to: "p@porch.com", rev_share: false, is_active: false, frequency: "yearly" })).toMatchObject({ code: "invalid" });
    expect(await addVendorReport({ vendor_name: "Porch101", lp_sub_sources: "Porch101", recipients_to: "", rev_share: false, is_active: true })).toMatchObject({ code: "invalid" });
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("refuses a non-operator", async () => {
    getAccessContext.mockResolvedValue(ctx({ role: "team" }));
    const { addVendorReport } = await subject();
    expect(await addVendorReport({ vendor_name: "X", lp_sub_sources: "X", recipients_to: "", rev_share: false, is_active: true })).toMatchObject({ code: "not_operator" });
    expect(insert).not.toHaveBeenCalled();
  });
});
