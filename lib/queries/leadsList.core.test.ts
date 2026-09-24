/**
 * The Leads search box and query string. Search must read "4073739355",
 * "(407) 373-9355", "577851" and a GHL id as what they are — a wrong read
 * sends an exact-match lookup down the fuzzy name path and finds nobody.
 */
import { describe, expect, it } from "vitest";
import { classifySearch, parseLeadsQuery, toE164 } from "./leadsList.core";

describe("classifySearch", () => {
  it("reads phones in any format as E.164 (spec verification #2)", () => {
    expect(classifySearch("4073739355")).toEqual({ kind: "phone", e164: "+14073739355" });
    expect(classifySearch("(407) 373-9355")).toEqual({ kind: "phone", e164: "+14073739355" });
    expect(classifySearch("+1 407.373.9355")).toEqual({ kind: "phone", e164: "+14073739355" });
  });

  it("reads short numbers as LP ids and GHL ids as ids", () => {
    expect(classifySearch("577851")).toEqual({ kind: "lp_id", id: "577851" });
    expect(classifySearch("gkJmc5DPc3nHXoevNH5K")).toEqual({ kind: "ghl_id", id: "gkJmc5DPc3nHXoevNH5K" });
  });

  it("falls back to email and name", () => {
    expect(classifySearch("joy@example.com").kind).toBe("email");
    expect(classifySearch("Joy Moberly")).toEqual({ kind: "name", q: "Joy Moberly" });
    expect(classifySearch("Moberly")).toEqual({ kind: "name", q: "Moberly" });
  });

  it("E.164 only for real phone lengths", () => {
    expect(toE164("12345")).toBeNull();
    expect(toE164("1-407-373-9355")).toBe("+14073739355");
  });
});

describe("parseLeadsQuery", () => {
  it("reads lists, enums and the cursor", () => {
    const r = parseLeadsQuery({
      source: ["Canvass", "Internet"],
      workflow: "s2.2,e.4",
      bot: "dnc",
      stuck: "7",
      cursorDate: "2026-09-24T15:01:34.152Z",
      cursorId: "obj6",
    });
    expect(r.filters.source).toEqual(["Canvass", "Internet"]);
    expect(r.filters.workflow).toEqual(["S2.2", "E.4"]);
    expect(r.filters.bot).toBe("dnc");
    expect(r.filters.stuck).toBe(7);
    expect(r.cursor).toEqual({ d: "2026-09-24T15:01:34.152Z", id: "obj6" });
  });

  it("ignores junk and applies view presets", () => {
    const r = parseLeadsQuery({ bot: "maybe", stuck: "5", view: "cancelled-week" });
    expect(r.filters.bot).toBeNull();
    expect(r.filters.stuck).toBeNull();
    expect(r.filters.appt).toBe("missed");
    expect(r.view).toBe("cancelled-week");
    expect(parseLeadsQuery({ view: "new-today" }).filters.entered).toBe("today");
  });
});
