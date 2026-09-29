/**
 * /lead-leaks view-model. What these guard, in order of cost if broken:
 *   - only leak reasons reach the "haven't called" list and the $ total,
 *   - the longest-waiting lead is at the top,
 *   - today's partial day never drags the 7-day numbers,
 *   - "in LP but unlinked" and "Five9 reached them" are never listed as missing.
 */
import { describe, expect, it } from "vitest";
import {
  filterLeaks,
  formatAge,
  formatMinutes,
  formatPhone,
  isLeak,
  shapeIntake,
  shapeLeaks,
  shapeSpeed,
  shiftDay,
  type LeakRowRaw,
  type SpeedRowRaw,
} from "./leadLeaks.core";

const NOW = Date.parse("2026-09-26T16:00:00Z");

const leakRow = (over: Partial<LeakRowRaw> = {}): LeakRowRaw => ({
  lp_lead_id: "1",
  lead_source: "Google PPC",
  disposition: null,
  reason: "routing_or_automation_failure",
  est_value: "1200.50",
  detail: { first_name: "Jane", last_name: "Doe", phone10: "3524453161", created_utc: "2026-09-26T13:00:00Z" },
  ...over,
});

describe("shapeLeaks", () => {
  it("lists leak reasons only, longest-waiting first, and totals $ over leaks only", () => {
    const view = shapeLeaks(
      [
        leakRow({ lp_lead_id: "1" }),
        leakRow({ lp_lead_id: "2", reason: "not_covered_by_rep", est_value: 800,
          detail: { first_name: "Sam", last_name: "", phone10: "9415550101", created_utc: "2026-09-20T13:00:00Z" } }),
        leakRow({ lp_lead_id: "3", reason: "dnc", est_value: null }),
        leakRow({ lp_lead_id: "4", reason: "data_undecided", est_value: null }),
      ],
      NOW,
    );
    expect(view.totalLeaks).toBe(2);
    expect(view.uncalled).toBe(4);
    expect(view.valueAtRisk).toBe(2001);
    expect(view.leaks.map((l) => l.lpLeadId)).toEqual(["2", "1"]);
    expect(view.leaks[1]).toMatchObject({
      name: "Jane Doe",
      phone: "(352) 445-3161",
      reasonLabel: "Never dialled — Five9 has the number",
      waitingMs: 3 * 3600000,
    });
    expect(view.byReason[0]?.leak).toBe(true);
    expect(view.byReason.filter((r) => !r.leak).map((r) => r.reason).sort()).toEqual(["data_undecided", "dnc"]);
  });

  it("filters by reason and source", () => {
    const { leaks } = shapeLeaks([leakRow({ lp_lead_id: "1" }), leakRow({ lp_lead_id: "2", lead_source: "Canvass" })], NOW);
    expect(filterLeaks(leaks, { source: "Canvass" }).map((l) => l.lpLeadId)).toEqual(["2"]);
    expect(filterLeaks(leaks, { reason: "not_in_five9" })).toEqual([]);
    expect(filterLeaks(leaks, {})).toHaveLength(2);
  });

  it("knows which reasons are leaks", () => {
    expect(isLeak("rep_hold_expired")).toBe(true);
    expect(isLeak("not_on_dial_list")).toBe(true);
    expect(isLeak("rep_hold")).toBe(false);
    expect(isLeak("already_progressed")).toBe(false);
  });
});

const day = (d: string, over: Partial<SpeedRowRaw> = {}): SpeedRowRaw => ({
  created_day: d, leads: 10, expected: 10, called: 10, never_called: 0,
  called_1h: 5, called_24h: 9, median_min: "40", p90_min: "600", ...over,
});

describe("shapeSpeed", () => {
  it("compares the last 7 complete days with the 28 before, leaving today out", () => {
    const rows: SpeedRowRaw[] = [];
    for (let i = 8; i <= 35; i++) rows.push(day(shiftDay("2026-09-26", -i), { median_min: 100 }));
    for (let i = 1; i <= 7; i++) rows.push(day(shiftDay("2026-09-26", -i), { median_min: 50 }));
    rows.push(day("2026-09-26", { median_min: 1, called_1h: 10 })); // today — partial
    const v = shapeSpeed(rows, "2026-09-26");
    expect(v.last7.days).toBe(7);
    expect(v.last7.medianMin).toBe(50);
    expect(v.prior28.medianMin).toBe(100);
    expect(v.deltaMin).toBe(-50);
    expect(v.last7.pctCalled1h).toBe(0.5);
    expect(v.days.at(-1)?.day).toBe("2026-09-26");
  });

  it("says nothing rather than zero when there is no data", () => {
    const v = shapeSpeed([], "2026-09-26");
    expect(v.last7.medianMin).toBeNull();
    expect(v.last7.pctCalled1h).toBeNull();
    expect(v.deltaMin).toBeNull();
  });
});

describe("shapeIntake", () => {
  it("lists only contacts that never reached LP and were never called", () => {
    const v = shapeIntake([
      { ghl_contact_id: "a", first_name: "Ann", last_name: "Ray", phone10: "9415550101", source: "Chat Widget",
        date_added: "2026-09-21T12:00:00Z", class: "not_in_lp" },
      { ghl_contact_id: "b", first_name: null, last_name: null, phone10: "9415550102", source: null,
        date_added: "2026-09-20T12:00:00Z", class: "not_in_lp_but_called" },
      { ghl_contact_id: "c", first_name: "Cy", last_name: "Lo", phone10: "9415550103", source: "Modernize",
        date_added: "2026-09-19T12:00:00Z", class: "in_lp_unlinked" },
    ]);
    expect(v.missing.map((c) => c.ghlContactId)).toEqual(["a"]);
    expect(v.missing[0]).toMatchObject({ name: "Ann Ray", phone: "(941) 555-0101", source: "Chat Widget" });
    expect(v.calledAnyway).toBe(1);
    expect(v.unlinked).toBe(1);
    expect(v.checked).toBe(3);
  });
});

describe("formatting", () => {
  it("formats ages, minutes and phones", () => {
    expect(formatAge(40 * 60000)).toBe("40m");
    expect(formatAge(5 * 3600000 + 12 * 60000)).toBe("5h 12m");
    expect(formatAge(3 * 86400000 + 4 * 3600000)).toBe("3d 4h");
    expect(formatAge(null)).toBe("—");
    expect(formatMinutes(96.2)).toBe("1h 36m");
    expect(formatMinutes(null)).toBe("—");
    expect(formatPhone("3524453161")).toBe("(352) 445-3161");
    expect(formatPhone(null)).toBe("—");
  });
});
