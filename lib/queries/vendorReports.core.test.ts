import { describe, expect, it } from "vitest";
import {
  deliveryLabel,
  formatDateMdy,
  formatEmails,
  formatSubSources,
  lastRunLabel,
  latestRunByVendor,
  parseEmails,
  parseSubSources,
  scheduleLabel,
  sortVendors,
  toItems,
  type SendLogRow,
  type VendorConfigRow,
} from "@/lib/queries/vendorReports.core";

function vendor(over: Partial<VendorConfigRow>): VendorConfigRow {
  return {
    id: 1, vendor_name: "Modernize", lp_sub_sources: ["Modernize"], recipients_to: [], recipients_cc: [], recipients_bcc: [],
    send_dow: 1, send_time: "09:00:00", timezone: "America/New_York", lookback_days: 90,
    is_active: true, dry_run: true, rev_share: false, frequency: "weekly", notes: null, updated_at: "2026-10-13T00:00:00Z", ...over,
  };
}
function log(over: Partial<SendLogRow>): SendLogRow {
  return {
    id: 1, vendor_id: 1, vendor_name: "Modernize", week_start: "2026-10-12", status: "blocked", lead_count: null,
    reason: "no_feed_email", dry_run: true, attempted_at: "2026-10-13T22:07:05Z", ...over,
  };
}

describe("parseEmails", () => {
  it("splits on commas, semicolons, spaces and new lines, lower-cases and de-duplicates", () => {
    const r = parseEmails("A@x.com, b@y.org; a@x.com\nc@z.net d@w.io");
    expect(r.emails).toEqual(["a@x.com", "b@y.org", "c@z.net", "d@w.io"]);
    expect(r.invalid).toEqual([]);
  });
  it("names what is not an address instead of dropping it silently", () => {
    const r = parseEmails("mark@reece.com, not-an-email, @nope");
    expect(r.emails).toEqual(["mark@reece.com"]);
    expect(r.invalid).toEqual(["not-an-email", "@nope"]);
  });
  it("an empty box is an empty list", () => {
    expect(parseEmails("")).toEqual({ emails: [], invalid: [] });
    expect(formatEmails([])).toBe("");
    expect(formatEmails(["a@b.c", "d@e.f"])).toBe("a@b.c, d@e.f");
  });
});

describe("parseSubSources", () => {
  it("keeps LP's spelling, trims, collapses spaces and de-duplicates case-insensitively", () => {
    expect(parseSubSources(" LeadPilot ,leadpilot\nLeadPilotData,  Google  PPC Windows ")).toEqual([
      "LeadPilot", "LeadPilotData", "Google PPC Windows",
    ]);
  });
});

describe("formatSubSources / formatDateMdy", () => {
  it("joins the list for the textarea and prints dates as MM-DD-YYYY in Eastern time", () => {
    expect(formatSubSources(["Bing PPC", "Google"])).toBe("Bing PPC, Google");
    expect(formatSubSources(null)).toBe("");
    // 03:30 UTC on the 20th is still the 19th in New York.
    expect(formatDateMdy("2026-10-20T03:30:00Z")).toBe("10-19-2026");
    expect(formatDateMdy("bad")).toBe("");
    expect(formatDateMdy(null)).toBe("");
  });
});

describe("latestRunByVendor / toItems", () => {
  it("keeps the newest row per vendor whatever the input order", () => {
    const rows = [
      log({ id: 5, status: "sent", lead_count: 5438, attempted_at: "2026-10-19T13:07:00Z" }),
      log({ id: 2 }),
      log({ id: 9, vendor_id: 2, vendor_name: "HomeBuddy", status: "empty" }),
      log({ id: 3, vendor_id: null }),
    ];
    const m = latestRunByVendor(rows);
    expect(m.get(1)).toMatchObject({ status: "sent", leadCount: 5438 });
    expect(m.get(2)).toMatchObject({ status: "empty" });
    expect(m.size).toBe(2);
    const items = toItems([vendor({ id: 2, vendor_name: "HomeBuddy" }), vendor({})], rows);
    expect(items.map((i) => i.vendor_name)).toEqual(["HomeBuddy", "Modernize"]);
    expect(items[1]?.lastRun?.leadCount).toBe(5438);
  });
  it("sorts active vendors first, then by name", () => {
    const s = sortVendors([
      vendor({ vendor_name: "Canvass", is_active: false }),
      vendor({ vendor_name: "Swish Leads" }),
      vendor({ vendor_name: "HomeBuddy" }),
    ]);
    expect(s.map((v) => v.vendor_name)).toEqual(["HomeBuddy", "Swish Leads", "Canvass"]);
  });
});

describe("labels", () => {
  it("reads a run back in plain words", () => {
    expect(lastRunLabel(null)).toBe("Never run");
    expect(lastRunLabel({ status: "sent", leadCount: 5438, reason: null, dryRun: true, attemptedAt: "2026-10-19T13:07:00Z" }))
      .toBe("Sent (dry run) · 5,438 leads · 10-19-2026");
    expect(lastRunLabel({ status: "blocked", leadCount: null, reason: "feed_stale (30.1h old)", dryRun: true, attemptedAt: "2026-10-13T22:07:05Z" }))
      .toBe("Blocked · feed_stale · 10-13-2026");
    expect(lastRunLabel({ status: "empty", leadCount: 0, reason: "no leads", dryRun: true, attemptedAt: "bad" }))
      .toBe("No leads");
  });
  it("says where the next email goes", () => {
    expect(deliveryLabel(vendor({ is_active: false }))).toMatch(/^Off/);
    // Dry run is retired from the page (Mark, 2026-10-14): a vendor that is on sends to its emails.
    expect(deliveryLabel(vendor({}))).toMatch(/no_recipients/);
    expect(deliveryLabel(vendor({ recipients_to: ["v@x.com"] }))).toBe("Sent to v@x.com. Hidden copy: m.richard@reecewindows.com.");
    // Mark is always first and never doubled; the page shows the real hidden-copy list (2026-10-15).
    expect(deliveryLabel(vendor({ recipients_to: ["v@x.com"], recipients_bcc: ["B.Codman@reecewindows.com", "m.richard@reecewindows.com"] })))
      .toBe("Sent to v@x.com. Hidden copy: m.richard@reecewindows.com, b.codman@reecewindows.com.");
    // The clock time is not shown: send_time is only "due from", the feed email is what sends (2026-10-14).
    expect(scheduleLabel(vendor({}))).toBe("Mondays, when the LP feed arrives");
    expect(scheduleLabel(vendor({ send_time: "00:00:00" }))).toBe("Mondays, when the LP feed arrives");
    expect(scheduleLabel(vendor({ frequency: "monthly" }))).toBe("1st of each month, when the LP feed arrives");
  });
});
