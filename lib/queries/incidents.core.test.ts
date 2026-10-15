/**
 * /incidents: P1 first then oldest, filters, the closed tab's median time to
 * acknowledge and resolve, the timeline in plain words, the Slack permalink.
 */
import { describe, expect, it } from "vitest";
import { affectedLeads, formatDuration, shapeBoard, shapeClosed, shapeTimeline, slackLink, type IncidentRaw } from "./incidents.core";

const NOW = Date.parse("2026-10-15T18:00:00Z");
function inc(over: Partial<IncidentRaw>): IncidentRaw {
  return {
    id: 1, fingerprint: "f", check_id: "lead.uncalled_live", system: "five9", severity: "P2", status: "open", title: "T",
    summary: null, business_impact: null, est_value_at_risk: null, occurrence_count: 1, opened_at: "2026-10-15T17:00:00Z",
    last_seen_at: "2026-10-15T17:50:00Z", acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null,
    snooze_until: null, known_issue_id: null, slack_channel: null, slack_ts: null, data: {}, ...over,
  };
}

describe("shapeBoard", () => {
  it("P1 first, then the oldest", () => {
    const rows = shapeBoard([
      inc({ id: 1, severity: "P2", opened_at: "2026-10-15T10:00:00Z" }),
      inc({ id: 2, severity: "P1", opened_at: "2026-10-15T17:00:00Z" }),
      inc({ id: 3, severity: "P1", opened_at: "2026-10-15T12:00:00Z" }),
    ], NOW);
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(rows[0]?.ageMin).toBe(360);
  });
  it("filters by status, system, severity and mine", () => {
    const all = [inc({ id: 1, status: "acknowledged", acknowledged_by: "me@x" }), inc({ id: 2, system: "ghl" }), inc({ id: 3, severity: "P1" })];
    expect(shapeBoard(all, NOW, { mine: "me@x" }).map((r) => r.id)).toEqual([1]);
    expect(shapeBoard(all, NOW, { system: "ghl" }).map((r) => r.id)).toEqual([2]);
    expect(shapeBoard(all, NOW, { severity: "P1" }).map((r) => r.id)).toEqual([3]);
    expect(shapeBoard(all, NOW, { status: "acknowledged" }).map((r) => r.id)).toEqual([1]);
  });
  it("money at risk, flapping and the legacy source", () => {
    const r = shapeBoard([inc({ est_value_at_risk: "4200", data: { flapping: true, source: "legacy" } })], NOW)[0]!;
    expect(r.valueAtRisk).toBe(4200);
    expect(r.flapping).toBe(true);
    expect(r.source).toBe("legacy");
  });
});

describe("shapeClosed", () => {
  it("medians of time to acknowledge and resolve", () => {
    const out = shapeClosed([
      inc({ id: 1, status: "resolved", opened_at: "2026-10-15T10:00:00Z", acknowledged_at: "2026-10-15T10:10:00Z", resolved_at: "2026-10-15T11:00:00Z" }),
      inc({ id: 2, status: "resolved", opened_at: "2026-10-15T12:00:00Z", acknowledged_at: "2026-10-15T12:30:00Z", resolved_at: "2026-10-15T15:00:00Z" }),
      inc({ id: 3, status: "closed_no_action", opened_at: "2026-10-15T13:00:00Z", resolved_at: "2026-10-15T13:05:00Z" }),
    ], NOW);
    expect(out.medianTtaMin).toBe(20);
    expect(out.medianTtrMin).toBe(60);
    expect(out.rows[0]?.id).toBe(3);
  });
});

describe("timeline and helpers", () => {
  it("plain words, oldest first, System for the platform", () => {
    const t = shapeTimeline([
      { id: 2, at: "2026-10-15T17:10:00Z", actor: "mark@reecewindows.com", kind: "acknowledged", body: null, data: {} },
      { id: 1, at: "2026-10-15T17:00:00Z", actor: "system", kind: "opened", body: "3 leads waiting", data: {} },
    ]);
    expect(t.map((e) => `${e.who}: ${e.what}`)).toEqual(["System: Opened", "mark@reecewindows.com: Acknowledged"]);
  });
  it("durations, Slack links, affected leads", () => {
    expect(formatDuration(95)).toBe("1h 35m");
    expect(formatDuration(null)).toBe("—");
    expect(slackLink("C0BVDPL84LF", "1760000000.123456")).toBe("https://slack.com/archives/C0BVDPL84LF/p1760000000123456");
    expect(slackLink(null, null)).toBeNull();
    expect(affectedLeads({ detail: { leads: [{ name: "Pat Q." }] } })).toEqual([{ name: "Pat Q." }]);
    expect(affectedLeads(null)).toEqual([]);
  });
});
