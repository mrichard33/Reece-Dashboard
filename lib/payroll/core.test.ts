import { describe, expect, it } from "vitest";
import {
  buildTabs,
  resolveTab,
  resolveRun,
  lineStatusBadge,
  disputeStatusBadge,
  canDisputeLine,
  validateDisputeForm,
  validateDecisionForm,
  formatCents,
  weekLabel,
  programOf,
} from "./core";

const line = (event_type: string, status: string, amount_cents: number) =>
  ({ event_type, status, amount_cents }) as Parameters<typeof buildTabs>[0][number];

describe("buildTabs", () => {
  it("shows the three pay programs in order, then Disputes, with counts and payable $", () => {
    const tabs = buildTabs(
      [
        line("canvass_confirmed_appt", "pending", 1500),
        line("canvass_confirmed_appt", "needs_review", 1500),
        line("completed_demo", "info", 0),
        line("completed_demo", "pending", 25000),
      ],
      2,
    );
    expect(tabs.map((t) => t.key)).toEqual(["canvass", "demos", "direct", "disputes"]);
    expect(tabs[0]).toMatchObject({ count: 2, payableCents: 1500 });
    expect(tabs[1]).toMatchObject({ count: 2, payableCents: 25000 });
    expect(tabs[2]).toMatchObject({ count: 0, payableCents: 0 });
    expect(tabs[3]).toMatchObject({ key: "disputes", count: 2 });
  });

  it("adds Adjustments only when the week has any", () => {
    const tabs = buildTabs([line("dispute_adjustment", "pending", 1500)], 0);
    expect(tabs.map((t) => t.key)).toEqual(["canvass", "demos", "direct", "adjustments", "disputes"]);
  });

  it("never counts info, flagged or excluded lines as payable", () => {
    const tabs = buildTabs(
      ["info", "needs_review", "disputed", "excluded"].map((s) => line("completed_demo", s, 25000)),
      0,
    );
    expect(tabs[1]?.payableCents).toBe(0);
  });
});

describe("resolveTab / resolveRun", () => {
  const tabs = buildTabs([], 0);
  it("falls back to the first tab for an unknown or missing value", () => {
    expect(resolveTab("nope", tabs)).toBe("canvass");
    expect(resolveTab(null, tabs)).toBe("canvass");
    expect(resolveTab("disputes", tabs)).toBe("disputes");
    expect(resolveTab("adjustments", tabs)).toBe("canvass");
  });
  it("picks the requested week only if it is in the partner's list", () => {
    const runs = [{ id: "a" }, { id: "b" }];
    expect(resolveRun(runs, "b")?.id).toBe("b");
    expect(resolveRun(runs, "someone-elses-run")?.id).toBe("a");
    expect(resolveRun([], "x")).toBeNull();
  });
});

describe("labels", () => {
  it("maps line and ticket statuses to plain words", () => {
    expect(lineStatusBadge("pending").label).toBe("Ready to pay");
    expect(lineStatusBadge("info")).toEqual({ label: "Info only", tone: "sky" });
    expect(disputeStatusBadge("open").label).toBe("Open");
    expect(disputeStatusBadge("approved").tone).toBe("emerald");
    expect(disputeStatusBadge("denied").tone).toBe("rose");
  });
  it("formats money from integer cents and weeks from dates", () => {
    expect(formatCents(1851900)).toBe("$18,519.00");
    expect(formatCents(1500)).toBe("$15.00");
    expect(formatCents(null)).toBe("—");
    expect(weekLabel("2026-09-14", "2026-09-20")).toBe("9/14 – 9/20");
    expect(programOf("direct_job_net")).toBe("direct");
  });
});

describe("disputes", () => {
  it("settled lines and lines with an open ticket cannot be disputed", () => {
    expect(canDisputeLine({ status: "info" }, false)).toBe(true);
    expect(canDisputeLine({ status: "paid" }, false)).toBe(false);
    expect(canDisputeLine({ status: "approved" }, false)).toBe(false);
    expect(canDisputeLine({ status: "pending" }, true)).toBe(false);
  });

  it("a line dispute needs only a reason; a missing-lead ticket needs lead, event and date", () => {
    expect(validateDisputeForm({ ledgerId: "x", reason: "no" })).toMatch(/what is wrong/);
    expect(validateDisputeForm({ ledgerId: "x", reason: "Lead was 45 days old", claimedAmount: "250" })).toBeNull();
    expect(validateDisputeForm({ ledgerId: "x", reason: "Lead was 45 days old", claimedAmount: "abc" })).toMatch(/dollar/);
    expect(validateDisputeForm({ reason: "We set this one", lpLeadId: "12a" })).toMatch(/lead ID/);
    expect(validateDisputeForm({ reason: "We set this one", lpLeadId: "578449", eventType: "bonus" })).toMatch(/earned/);
    expect(validateDisputeForm({ reason: "We set this one", lpLeadId: "578449", eventType: "completed_demo", eventDate: "9/16" })).toMatch(/date/);
    expect(
      validateDisputeForm({ reason: "We set this one", lpLeadId: "578449", eventType: "completed_demo", eventDate: "2026-09-16" }),
    ).toBeNull();
  });

  it("a denial needs a note; an approval amount must be dollars", () => {
    expect(validateDecisionForm("deny", "", "")).toMatch(/note/);
    expect(validateDecisionForm("deny", "LP shows 12 days old", "")).toBeNull();
    expect(validateDecisionForm("approve", "", "")).toBeNull();
    expect(validateDecisionForm("approve", "", "15.5x")).toMatch(/dollar/);
    expect(validateDecisionForm("approve", "", "1,250.00")).toBeNull();
  });
});
