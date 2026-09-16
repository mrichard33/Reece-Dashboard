import { describe, expect, it } from "vitest";
import {
  badgeFor,
  dotFor,
  groupRows,
  isConnectorState,
  summarize,
  summaryLine,
  type ConnectorStatus,
} from "./types";

const row = (id: string, state: ConnectorStatus["state"], group: ConnectorStatus["group"] = "services"): ConnectorStatus => ({
  id,
  name: id,
  group,
  state,
  detail: "",
  checkedAt: "2026-09-16T00:00:00.000Z",
});

describe("connector state presentation", () => {
  it("only connected is green; unknown and not_configured are grey, never green", () => {
    expect(dotFor("connected")).toBe("healthy");
    expect(dotFor("degraded")).toBe("warning");
    expect(dotFor("error")).toBe("critical");
    expect(dotFor("unknown")).toBe("neutral");
    expect(dotFor("not_configured")).toBe("neutral");
  });

  it("badge labels word each state the same way everywhere", () => {
    expect(badgeFor("connected")).toEqual({ tone: "emerald", label: "Connected" });
    expect(badgeFor("unknown")).toEqual({ tone: "slate", label: "Unknown" });
    expect(badgeFor("not_configured")).toEqual({ tone: "slate", label: "Not configured" });
    expect(badgeFor("error").tone).toBe("rose");
    expect(badgeFor("degraded").tone).toBe("amber");
  });

  it("validates states so a foreign value can never masquerade as a pass", () => {
    expect(isConnectorState("connected")).toBe(true);
    expect(isConnectorState("green")).toBe(false);
    expect(isConnectorState(undefined)).toBe(false);
  });
});

describe("summarize + summaryLine", () => {
  it("counts per state and drops zero counts from the line", () => {
    const s = summarize([row("a", "connected"), row("b", "connected"), row("c", "unknown"), row("d", "error")]);
    expect(s.total).toBe(4);
    expect(s.connected).toBe(2);
    expect(s.unknown).toBe(1);
    expect(summaryLine(s)).toBe("2 connected · 1 error · 1 unknown");
  });

  it("says so when nothing was checked", () => {
    expect(summaryLine(summarize([]))).toBe("No integrations checked");
  });
});

describe("groupRows", () => {
  it("orders groups for display and omits empty groups", () => {
    const groups = groupRows([row("n8n", "connected", "automation"), row("lp", "connected", "services"), row("five9", "error", "dialer")]);
    expect(groups.map((g) => g.group)).toEqual(["services", "dialer", "automation"]);
    expect(groups[0]?.label).toBe("Services");
  });
});
