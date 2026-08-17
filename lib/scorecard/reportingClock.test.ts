import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveSellingCalendar, sellingDaysElapsed, lastCompletedSellingDay } from "@/lib/date/sellingDays";
import { prorateGoal } from "@/lib/scorecard/paceTargets";
import { measured, unmeasured } from "@/lib/scorecard/tiers/types";
import {
  declaredCutoff,
  buildReportingClock,
  gate,
  lagBadge,
  clockChip,
  type SourceClock,
  type SourceId,
} from "./reportingClock";

/**
 * Guards for the ONE reporting cutoff.
 *
 * All figures verified against the LP warehouse on 2026-08-13. The August
 * report-137 snapshot is period_start 2026-08-01, period_end 2026-08-10,
 * as_of_date 2026-08-11, is_partial_month false — the two dates this module
 * exists to stop conflating.
 */

const CAL = resolveSellingCalendar({
  SCORECARD_SELLING_DAYS: "mon,tue,wed,thu,fri,sat",
  SCORECARD_HOLIDAYS: "none",
});

const AUG = { periodStart: "2026-08-01", periodEnd: "2026-08-31" };

// ── Verified live figures ───────────────────────────────────────────────────
const COMPANY_GOAL = 11_012_374; // scorecard_goals_monthly, 2026-08-01, basis 'net'
const NET_SALES_MTD = 1_852_941; // Σ net_sales_cents / 100, 7 markets, is_current
const COVERAGE = "2026-08-10"; // period_end of the current snapshot
const RUN_DATE = "2026-08-11"; // as_of_date — the date that WAS being displayed

const netSales = (over: Partial<SourceClock> = {}): SourceClock => ({
  id: "net_sales",
  label: "Net Sales · report 137",
  role: { kind: "current_period", goalBearing: true },
  dataThrough: measured(COVERAGE),
  stampedAt: RUN_DATE,
  ...over,
});

const liveSync = (over: Partial<SourceClock> = {}): SourceClock => ({
  id: "live_sync",
  label: "Live sync",
  role: { kind: "current_period" },
  dataThrough: measured(COVERAGE),
  stampedAt: COVERAGE,
  ...over,
});

const rtp = (over: Partial<SourceClock> = {}): SourceClock => ({
  id: "released_rtp",
  label: "Released · report 134",
  role: {
    kind: "exempt",
    why: "dated by production milestone — a contract sold in April is released in August",
  },
  dataThrough: measured("2026-08-06"),
  stampedAt: "2026-08-06",
  ...over,
});

const build = (today: string, over: Partial<Record<SourceId, SourceClock>> = {}) =>
  buildReportingClock({
    today,
    period: AUG,
    cal: CAL,
    sources: { net_sales: netSales(), live_sync: liveSync(), released_rtp: rtp(), ...over },
  });

// ═══ A · the calendar facts everything else rests on ═════════════════════════

describe("the declared cutoff", () => {
  it("is yesterday — today never counts", () => {
    expect(declaredCutoff("2026-08-12", AUG).date).toBe("2026-08-11");
    // The user's own framing: at 11pm ET on Aug 11, the cutoff is Aug 10.
    expect(declaredCutoff("2026-08-11", AUG).date).toBe("2026-08-10");
  });

  it("Monday's cutoff IS Sunday — a bonus day, covered but never paced (ruling 2026-08-17)", () => {
    // 2026-08-09 is a Sunday. It is not a selling day — pace math never counts
    // it — but Sunday business is real, so Monday the 10th claims data through
    // the 9th, NOT through Saturday the 8th. The pre-ruling behavior (cutoff
    // 08-08) is exactly how the header spent every Monday two days behind.
    const c = declaredCutoff("2026-08-10", AUG);
    expect(c.date).toBe("2026-08-09");
    expect(c.basis).toBe("previous_calendar_day");
    // The selling calendar still refuses to count the bonus day as elapsed:
    expect(sellingDaysElapsed("2026-08-01", "2026-08-09", CAL)).toBe(
      sellingDaysElapsed("2026-08-01", "2026-08-08", CAL),
    );
  });

  it("CLAMPS to the period end, so a closed month is not permanently 'behind'", () => {
    const july = { periodStart: "2026-07-01", periodEnd: "2026-07-31" };
    const c = declaredCutoff("2026-08-12", july);
    expect(c.date).toBe("2026-07-31");
    expect(c.basis).toBe("period_end");
    // Anti-vacuity: without the clamp this would be August's cutoff, and every
    // July figure — including a file covering all of July — would read stale.
    expect(c.date).not.toBe(lastCompletedSellingDay("2026-08-12", CAL));
  });
});

// ═══ B · the hard gate ═══════════════════════════════════════════════════════

describe("the gate", () => {
  it("REFUSES a source whose data runs past the cutoff", () => {
    // The failure the whole exercise is guarding: a file claiming Aug 1-31
    // landing mid-month and being paced against 8 elapsed selling days.
    const a = build("2026-08-11", { net_sales: netSales({ dataThrough: measured("2026-08-31") }) });
    expect(a.bySource.net_sales.status).toBe("refused");
    expect(a.refused).toContain("net_sales");

    const g = gate(a.bySource.net_sales, NET_SALES_MTD);
    expect(g.status).toBe("refused");
    // The whole point of the Gated shape: a refused verdict carries NO value
    // key, so `g.value` cannot compile without narrowing on status first.
    expect("value" in g).toBe(false);
  });

  it("a refused source cannot set the pace anchor, and the target does not collapse to zero", () => {
    const a = build("2026-08-11", { net_sales: netSales({ dataThrough: measured("2026-08-31") }) });
    expect(a.cutoff.achieved.known).toBe(false);
    // Falls back to the declared cutoff — NOT to 0, which would read as "nothing
    // was expected yet" and is the most flattering possible lie.
    expect(a.cutoff.paceElapsedDays).toBe(sellingDaysElapsed("2026-08-01", "2026-08-10", CAL));
    expect(a.cutoff.paceElapsedDays).not.toBe(0);
  });

  it("keeps the value on a LAGGING source — late is not missing", () => {
    const a = build("2026-08-12"); // declared 08-11, coverage 08-10
    expect(a.bySource.net_sales.status).toBe("lagging");
    const g = gate(a.bySource.net_sales, NET_SALES_MTD);
    expect(g.status).toBe("lagging");
    expect(g.status !== "refused" && g.value).toBe(NET_SALES_MTD);
    expect(a.bySource.net_sales.lagSellingDays).toBe(1);
  });

  it("keeps the value on an UNVERIFIED source, but bars it from setting the cutoff", () => {
    // is_partial_month = true → data_through NULL. The file cannot say what it
    // covers; that is not evidence of a violation, so it is not blanked.
    const a = build("2026-08-11", {
      net_sales: netSales({
        dataThrough: unmeasured<string>("the report 137 snapshot for 2026-08 is partial"),
      }),
    });
    expect(a.bySource.net_sales.status).toBe("unverified");
    expect(gate(a.bySource.net_sales, NET_SALES_MTD).status).toBe("unverified");
    expect(a.cutoff.achieved.known).toBe(false);
    expect(a.refused).toHaveLength(0);
    expect(a.bySource.net_sales.note).toMatch(/partial/);
  });

  it("says CURRENT when coverage equals the cutoff — which is today's real state", () => {
    // At 11pm ET on 2026-08-11 the cutoff is 08-10 and report 137 reaches 08-10.
    // Nothing is behind. The page's only off-cutoff source is exempt RTP.
    const a = build("2026-08-11");
    expect(a.bySource.net_sales.status).toBe("current");
    expect(a.bySource.live_sync.status).toBe("current");
    expect(a.cutoff.anchorLagSellingDays).toBe(0);
    expect(lagBadge(a.bySource.net_sales)).toBeNull();
  });

  it("the exemption does real work — and is not a blanket pass", () => {
    const a = build("2026-08-11");
    // RTP at 08-06 is four days back and is NOT refused or counted as lagging.
    expect(a.bySource.released_rtp.status).toBe("current");
    expect(a.lagging).not.toContain("released_rtp");

    // Flip ONLY the role and the identical date is now judged.
    const b = build("2026-08-11", {
      released_rtp: rtp({ role: { kind: "current_period" } }),
    });
    expect(b.bySource.released_rtp.status).toBe("lagging");
  });

  it("an exempt source cannot be gated past the cutoff into a current-period slot", () => {
    // RTP dated beyond the cutoff is fine ON ITS OWN BASIS...
    const a = build("2026-08-11", { released_rtp: rtp({ dataThrough: measured("2026-08-31") }) });
    expect(a.bySource.released_rtp.status).toBe("current");
    // ...but the same date on a current-period role refuses, which is what stops
    // an exemption being used to smuggle a figure onto the sales panel.
    const b = build("2026-08-11", {
      released_rtp: rtp({ dataThrough: measured("2026-08-31"), role: { kind: "current_period" } }),
    });
    expect(b.bySource.released_rtp.status).toBe("refused");
  });
});

// ═══ C · the pace anchor — the money assertions ══════════════════════════════

describe("the pace anchor moves with the data", () => {
  it("takes the achieved cutoff from the GOAL-BEARING source alone", () => {
    const a = build("2026-08-12", { live_sync: liveSync({ dataThrough: measured("2026-08-07") }) });
    expect(a.cutoff.achieved.known && a.cutoff.achieved.value).toBe("2026-08-10");
    expect(a.cutoff.achievedFrom).toBe("net_sales");
    // Not a min across sources (that would drag the sales anchor onto an
    // unrelated feed's outage) and not the declared date.
    expect(a.cutoff.achieved.known && a.cutoff.achieved.value).not.toBe("2026-08-07");
    expect(a.cutoff.achieved.known && a.cutoff.achieved.value).not.toBe("2026-08-11");
  });

  it("prorates to 8 of 26 selling days, not 9 — and the difference is $423,553", () => {
    const a = build("2026-08-12"); // declared 08-11, achieved 08-10
    expect(a.cutoff.periodSellingDays).toBe(26);
    expect(a.cutoff.paceElapsedDays).toBe(8);
    expect(a.cutoff.calendarElapsedDays).toBe(9);
    expect(a.cutoff.anchorLagSellingDays).toBe(1);

    const aligned = Math.round(prorateGoal(COMPANY_GOAL, a.cutoff.paceElapsedDays, 26)!);
    const misaligned = Math.round(prorateGoal(COMPANY_GOAL, a.cutoff.calendarElapsedDays, 26)!);
    expect(aligned).toBe(3_388_423);
    expect(misaligned).toBe(3_811_976);
    expect(misaligned - aligned).toBe(423_553);
  });

  it("⚠️ aligning the anchor makes the page look BETTER — which is why the badge is mandatory", () => {
    // This reverses viewModel.ts's "a quiet feed must make the page look WORSE".
    // Recording the direction and the magnitude here so the trade-off cannot be
    // forgotten: on identical data, a late feed improves Balance by $423,553.
    const a = build("2026-08-12");
    const aligned = Math.round(prorateGoal(COMPANY_GOAL, a.cutoff.paceElapsedDays, 26)!);
    const misaligned = Math.round(prorateGoal(COMPANY_GOAL, a.cutoff.calendarElapsedDays, 26)!);

    expect(NET_SALES_MTD - aligned).toBe(-1_535_482);
    expect(NET_SALES_MTD - misaligned).toBe(-1_959_035);
    expect(NET_SALES_MTD - aligned).toBeGreaterThan(NET_SALES_MTD - misaligned);

    // Projected pace moves the same way: $6.02M vs $5.35M.
    expect(Math.round((NET_SALES_MTD / 8) * 26)).toBe(6_022_058);
    expect(Math.round((NET_SALES_MTD / 9) * 26)).toBe(5_352_941);

    // So the lag MUST be renderable from the audit alone.
    expect(lagBadge(a.bySource.net_sales)).toBeTruthy();
    expect(clockChip(a.cutoff).text).toMatch(/1 selling day behind/);
  });

  it("the header names the ACHIEVED date, never the declared one", () => {
    const chip = clockChip(build("2026-08-12").cutoff);
    // 08-10 is what the numbers cover. 08-11 is only the reference that makes
    // the lag legible — it must not be the headline date.
    expect(chip.text).toContain("2026-08-10");
    expect(chip.text).not.toMatch(/Reporting through 2026-08-11/);
    expect(chip.title).toContain("2026-08-11");
  });

  it("names neither date as a run date — 08-11 must never appear as coverage", () => {
    const a = build("2026-08-11");
    // The regression in one line: as_of_date is carried, but only as stampedAt.
    expect(a.bySource.net_sales.clock.stampedAt).toBe(RUN_DATE);
    expect(a.cutoff.achieved.known && a.cutoff.achieved.value).toBe(COVERAGE);
    expect(clockChip(a.cutoff).text).not.toContain(RUN_DATE);
  });
});

// ═══ D · anti-blanking — the gate must not take the page down ════════════════

describe("degradation", () => {
  it("a dead sales feed refuses NOTHING and leaves a usable cutoff", () => {
    // fetchCurrentCohorts() returns [] on failure rather than throwing, so this
    // is the ordinary outage shape, not an exotic one.
    const a = build("2026-08-12", {
      net_sales: netSales({ dataThrough: unmeasured<string>("cohort view unreachable") }),
    });
    expect(a.refused).toHaveLength(0);
    expect(a.systemicRefusal).toBe(false);
    expect(a.cutoff.declared).toBe("2026-08-11");
    expect(a.cutoff.paceElapsedDays).toBe(9);
    expect(a.cutoff.achieved.known).toBe(false);
    expect(clockChip(a.cutoff).text).toBeTruthy();
  });

  it("the declared cutoff is pure calendar — no feed can move it", () => {
    const dead = unmeasured<string>("unreachable");
    const a = buildReportingClock({
      today: "2026-08-12",
      period: AUG,
      cal: CAL,
      sources: {
        net_sales: netSales({ dataThrough: dead }),
        live_sync: liveSync({ dataThrough: dead }),
        released_rtp: rtp({ dataThrough: dead }),
      },
    });
    expect(a.cutoff.declared).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.cutoff.declared).toBe(declaredCutoff("2026-08-12", AUG).date);
    expect(a.refused).toHaveLength(0);
  });

  it("flags systemic refusal rather than blanking, when EVERY gated source refuses", () => {
    const a = build("2026-08-11", {
      net_sales: netSales({ dataThrough: measured("2026-08-31") }),
      live_sync: liveSync({ dataThrough: measured("2026-08-31") }),
    });
    expect(a.refused).toEqual(["net_sales", "live_sync"]);
    expect(a.systemicRefusal).toBe(true);
  });

  it("a refused verdict still carries copy for the panel to render", () => {
    const a = build("2026-08-11", { net_sales: netSales({ dataThrough: measured("2026-08-31") }) });
    const g = gate(a.bySource.net_sales, NET_SALES_MTD);
    expect(g.status === "refused" && g.reason).toMatch(/past the reporting cutoff/);
    expect(g.audit.clock.label).toBe("Net Sales · report 137");
  });

  it("a null value is refused rather than rendered as $0", () => {
    const a = build("2026-08-11");
    expect(gate(a.bySource.net_sales, null).status).toBe("refused");
  });

  it("reports a registry violation instead of throwing", () => {
    const a = build("2026-08-11", { live_sync: liveSync({ role: { kind: "current_period", goalBearing: true } }) });
    expect(a.problems.join(" ")).toMatch(/exactly one source must be goal-bearing/);
    // Still returns a usable audit — problems are collected, never fatal.
    expect(a.cutoff.declared).toBe("2026-08-10");
  });

  it("is pure: same input, same output, and different days differ", () => {
    expect(build("2026-08-12")).toEqual(build("2026-08-12"));
    expect(build("2026-08-12").cutoff.declared).not.toBe(build("2026-08-13").cutoff.declared);
  });
});

// ═══ E · source scan — rules that cannot be unit-tested in a node env ════════

/** Strip comments so an explanatory sentence cannot satisfy a code assertion. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe("source discipline", () => {
  const FILES = ["components", "app", "lib"].flatMap((d) => walk(d));

  it("scanned a plausible number of files", () => {
    // The vacuity guard this repo already uses — a broken walk would make every
    // assertion below pass by scanning nothing.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("the clock never reads the wall clock itself", () => {
    // `today` is injected precisely so a UTC/ET mix-up cannot move the cutoff
    // forward and refuse every source between 8pm and midnight ET.
    const src = code(readFileSync("lib/scorecard/reportingClock.ts", "utf8"));
    expect(src).not.toMatch(/todayET\s*\(/);
    expect(src).not.toMatch(/new Date\s*\(\s*\)/);
    expect(src).not.toMatch(/Date\.now/);
  });

  it("no component computes elapsed selling days for itself", () => {
    // A panel deriving its own denominator is how the numerator and denominator
    // drifted apart in the first place.
    const offenders = FILES.filter(
      (f) => f.startsWith("components") && /sellingDaysElapsed\s*\(/.test(code(readFileSync(f, "utf8"))),
    );
    expect(offenders).toEqual([]);
  });
});

// ═══ E4 · a CLOSED period is dated by its BOUNDARY, not by last activity ═════
//
// The exempt branch reported `${label} reaches ${through}` unconditionally. On a
// still-running period `through` is a genuine watermark; on a closed one it is
// `max(milestone date)` — a COMPLETENESS date — and reads as missing data.
// Live symptom: "Released to production reaches 07-23-2026" for a July whose
// report-134 snapshot declares period_end 2026-07-31, is not partial, and was
// generated 2026-08-09. Nothing was missing; the month ended quietly.
describe("E4 — the exempt source on a closed period", () => {
  const JUL = { periodStart: "2026-07-01", periodEnd: "2026-07-31" };
  const buildJul = (today: string, through: string) =>
    buildReportingClock({
      today,
      period: JUL,
      cal: CAL,
      sources: {
        net_sales: netSales({ dataThrough: measured("2026-07-31") }),
        live_sync: liveSync({ dataThrough: measured("2026-07-31") }),
        released_rtp: rtp({ dataThrough: measured(through), stampedAt: through }),
      },
    });

  it("states coverage as the PERIOD END, keeping last activity beside it", () => {
    // Viewed on 2026-08-15, July is closed: declaredCutoff clamps to 07-31.
    const a = buildJul("2026-08-15", "2026-07-23");
    expect(a.cutoff.declaredBasis).toBe("period_end");
    const note = a.bySource.released_rtp.note;
    expect(note).toMatch(/covers this closed period in full, through 2026-07-31/);
    // The quiet-week date survives — dropped, it could not be investigated.
    expect(note).toMatch(/latest activity was 2026-07-23/);
    expect(note).toMatch(/completeness date, not a shortfall/);
    // It must NOT read as reach falling short of the month.
    expect(note).not.toMatch(/reaches 2026-07-23/);
  });

  it("is still CURRENT — the exemption is unchanged, only the wording", () => {
    const a = buildJul("2026-08-15", "2026-07-23");
    expect(a.bySource.released_rtp.status).toBe("current");
    expect(a.refused).not.toContain("released_rtp");
  });

  it("an OPEN period keeps the watermark wording — it is real information there", () => {
    // Mid-August, August selected: the period can still move, so how far RTP
    // reaches is live information rather than a completeness statement.
    const a = build("2026-08-11");
    expect(a.cutoff.declaredBasis).toBe("previous_calendar_day");
    expect(a.bySource.released_rtp.note).toMatch(/reaches 2026-08-06 on its own basis/);
    expect(a.bySource.released_rtp.note).not.toMatch(/closed period/);
  });

  it("data running PAST a closed period keeps the plain wording", () => {
    // An August release against a July cohort is exactly what the exemption
    // exists for, but it is not evidence July is 'covered through 07-31' — that
    // claim belongs only to data sitting inside the period.
    const a = buildJul("2026-08-15", "2026-08-09");
    expect(a.bySource.released_rtp.note).toMatch(/reaches 2026-08-09 on its own basis/);
    expect(a.bySource.released_rtp.note).not.toMatch(/covers this closed period/);
  });
});
