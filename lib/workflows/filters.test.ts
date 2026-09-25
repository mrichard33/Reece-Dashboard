import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, parseFilterState, sortRows, type FilterableRow } from "./filters";

const r = (over: Partial<FilterableRow> & { ghlWorkflowId: string }): FilterableRow => ({
  name: over.ghlWorkflowId,
  status: "published",
  canonicalCode: null,
  route: "entry",
  activeLeads: null,
  lastModified: null,
  messageSteps: 1,
  sending: null,
  ...over,
});

const rows = [
  r({ ghlWorkflowId: "f0", name: "F.0 Post-Appointment", canonicalCode: "F.0", route: "objections", sending: { sends30d: 0, silent: true } }),
  r({ ghlWorkflowId: "s22", name: "S2.2 Chatbot", canonicalCode: "S2.2", route: "indoctrination", sending: { sends30d: 900, silent: false }, activeLeads: 335 }),
  r({ ghlWorkflowId: "s45", name: "S4.5 Seinfeld", canonicalCode: "S4.5", route: "booking", sending: { sends30d: null, silent: null } }),
  r({ ghlWorkflowId: "d1", name: "Draft thing", status: "draft", route: "other", messageSteps: 0 }),
];
const none = new Set<string>();

describe("applyFilters", () => {
  it("defaults to published only", () => {
    expect(applyFilters(rows, DEFAULT_FILTERS, none).map((x) => x.ghlWorkflowId)).toEqual(["f0", "s22", "s45"]);
  });
  it("'silent' means measured-and-nothing, never 'could not tell'", () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, status: "silent" }, none).map((x) => x.ghlWorkflowId)).toEqual(["f0"]);
  });
  it("filters by route, favorites, messages and search", () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, routes: ["booking"] }, none).map((x) => x.ghlWorkflowId)).toEqual(["s45"]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, favoritesOnly: true }, new Set(["s22"])).map((x) => x.ghlWorkflowId)).toEqual(["s22"]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, status: "all", hasMessages: false }, none).map((x) => x.ghlWorkflowId)).toEqual(["d1"]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, q: "chat" }, none).map((x) => x.ghlWorkflowId)).toEqual(["s22"]);
  });
});

describe("sortRows", () => {
  it("chain order first, unlinked rows after by code; nulls last on numeric sorts", () => {
    const chain = new Map([["s45", 0], ["s22", 1]]);
    expect(sortRows(rows, { key: "chain", dir: 1 }, none, chain).map((x) => x.ghlWorkflowId)).toEqual(["s45", "s22", "f0", "d1"]);
    expect(sortRows(rows, { key: "sends", dir: -1 }, none, chain).map((x) => x.ghlWorkflowId)).toEqual(["s22", "f0", "s45", "d1"]);
    expect(sortRows(rows, { key: "favorites", dir: 1 }, new Set(["s45"]), chain)[0]?.ghlWorkflowId).toBe("s45");
  });
});

describe("parseFilterState", () => {
  it("accepts a saved preset, strips extras, rejects a bad one", () => {
    expect(parseFilterState({ ...DEFAULT_FILTERS, extra: 1 })).toEqual(DEFAULT_FILTERS);
    expect(parseFilterState({ ...DEFAULT_FILTERS, sort: { key: "nope", dir: 1 } })).toBeNull();
    expect(parseFilterState("junk")).toBeNull();
  });
});
