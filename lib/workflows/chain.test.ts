import { describe, expect, it } from "vitest";
import { chainOrder, type ChainInput } from "./chain";

const row = (id: string, code: string, route: ChainInput["route"], routesTo: string[] = [], receivesFrom: string[] = []): ChainInput => ({
  ghlWorkflowId: id,
  code,
  route,
  routesTo,
  receivesFrom,
});

describe("chainOrder", () => {
  it("orders a hand-off chain top to bottom, not alphabetically", () => {
    const m = chainOrder([
      row("s41", "S4.1", "booking", [], ["s31"]),
      row("s31", "S3.1", "booking", ["s41"], ["s21"]),
      row("s21", "S2.1", "booking", ["s31"]),
    ]);
    expect([...m.entries()].sort((a, b) => a[1].index - b[1].index).map(([id]) => id)).toEqual(["s21", "s31", "s41"]);
    expect(m.get("s41")?.depth).toBe(2);
  });

  it("ignores links to other routes and leaves unlinked rows without a position", () => {
    const m = chainOrder([
      row("e2", "E.2", "entry", ["s21"]),
      row("s21", "S2.1", "indoctrination", [], ["e2"]),
      row("lone", "E.9", "entry"),
    ]);
    expect(m.has("e2")).toBe(false);
    expect(m.has("s21")).toBe(false);
    expect(m.has("lone")).toBe(false);
  });

  it("survives a cycle (S3.1 ⇄ S3.1-E) by code order", () => {
    const m = chainOrder([
      row("a", "S3.1", "positioning", ["b"], ["b"]),
      row("b", "S3.1-E", "positioning", ["a"], ["a"]),
    ]);
    expect(m.get("a")?.index).toBe(0);
    expect(m.get("b")?.index).toBe(1);
  });

  it("orders a fork by code and never throws on unknown ids", () => {
    const m = chainOrder([row("root", "E.0", "entry", ["x", "y", "ghost"]), row("y", "E.7", "entry"), row("x", "E.5", "entry")]);
    expect(m.get("root")?.index).toBe(0);
    expect(m.get("x")?.index).toBe(1);
    expect(m.get("y")?.index).toBe(2);
  });
});
