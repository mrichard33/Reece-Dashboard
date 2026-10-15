/**
 * Plain words on the health pages: severity as Urgent/High/Medium/Low (shown
 * only when a check needs someone), statuses and families as words, and every
 * 24-hour time turned into a 12-hour one without touching dates or money.
 */
import { describe, expect, it } from "vitest";
import {
  allInTestMode, attentionLine, familyWord, isComingLater, plainTimes, severityWord, showSeverity, statusWord,
  SEVERITY_WORD, STATUS_WORD,
} from "./words";

describe("severity words", () => {
  it("maps P1..P4 and falls back to the code", () => {
    expect(SEVERITY_WORD).toEqual({ P1: "Urgent", P2: "High", P3: "Medium", P4: "Low" });
    expect(severityWord("P1")).toBe("Urgent");
    expect(severityWord("P4")).toBe("Low");
    expect(severityWord("P9")).toBe("P9");
    expect(severityWord(null)).toBe("");
  });
  it("is shown only on a red or yellow check", () => {
    expect(showSeverity("red")).toBe(true);
    expect(showSeverity("yellow")).toBe(true);
    expect(showSeverity("green")).toBe(false);
    expect(showSeverity("grey")).toBe(false);
  });
});

describe("status and family words", () => {
  it("statuses", () => {
    expect(STATUS_WORD).toEqual({
      pass: "All good", warn: "Needs a look", fail: "Needs attention", unknown: "Can't tell right now", skipped: "Not running now",
    });
    expect(statusWord("fail")).toBe("Needs attention");
    expect(statusWord(null)).toBe("No result yet");
    expect(statusWord("odd")).toBe("odd");
  });
  it("families, with a capitalized fallback", () => {
    expect(familyWord("lead")).toBe("Leads");
    expect(familyWord("workflow")).toBe("Automations");
    expect(familyWord("agent")).toBe("AI assistant");
    expect(familyWord("synthetic")).toBe("Test runs");
    expect(familyWord("billing")).toBe("Billing");
    expect(familyWord("rate_limit")).toBe("Rate limit");
  });
});

describe("attentionLine / isComingLater / allInTestMode", () => {
  it("says All good, or how many need someone, with the right plural", () => {
    expect(attentionLine({ red: 0, yellow: 0, green: 5 })).toBe("All good");
    expect(attentionLine({ red: 2, yellow: 1 })).toBe("2 need attention · 1 needs a look");
    expect(attentionLine({ red: 1, yellow: 0 })).toBe("1 needs attention");
    expect(attentionLine({ red: 0, yellow: 3 })).toBe("3 need a look");
  });
  it("spots a check that is not built yet", () => {
    expect(isComingLater("Not built yet (Phase 2)")).toBe(true);
    expect(isComingLater("execution check not built yet")).toBe(true);
    expect(isComingLater("3 leads waiting")).toBe(false);
    expect(isComingLater(null)).toBe(false);
  });
  it("test mode only while no check is live", () => {
    expect(allInTestMode([{ hollow: true }, { hollow: true }])).toBe(true);
    expect(allInTestMode([{ hollow: true }, { hollow: false }])).toBe(false);
    expect(allInTestMode([])).toBe(false);
  });
});

describe("plainTimes", () => {
  it("turns 24-hour times into 12-hour times", () => {
    expect(plainTimes("not issued by 19:30 ET")).toBe("not issued by 7:30 PM ET");
    expect(plainTimes("08:00-20:00 ET")).toBe("8:00 AM–8:00 PM ET");
    expect(plainTimes("08:00–20:00 ET")).toBe("8:00 AM–8:00 PM ET");
    expect(plainTimes("at 20:15 and 20:45 ET")).toBe("at 8:15 PM and 8:45 PM ET");
    expect(plainTimes("hourly 08-20 ET")).toBe("hourly 8 AM–8 PM ET");
    expect(plainTimes("07:00")).toBe("7:00 AM");
    expect(plainTimes("12:00")).toBe("12:00 PM");
    expect(plainTimes("00:30")).toBe("12:30 AM");
    expect(plainTimes("23:59")).toBe("11:59 PM");
  });
  it("leaves things that are not times alone", () => {
    for (const s of ["2026-10-16", "$9,141", "1/2", "10 of 28", "every 5 min", "on 2026-10-16 ET", "7:30 PM ET", "8 AM", "2026-10-16T19:30:00Z"]) {
      expect(plainTimes(s)).toBe(s);
    }
  });
  it("mixes times with other numbers in one sentence", () => {
    expect(plainTimes("10 of 28 leads on 2026-10-16 not dialed by 09:15 ($9,141 at risk)"))
      .toBe("10 of 28 leads on 2026-10-16 not dialed by 9:15 AM ($9,141 at risk)");
  });
  it("passes null through", () => {
    expect(plainTimes(null)).toBeNull();
  });
});
