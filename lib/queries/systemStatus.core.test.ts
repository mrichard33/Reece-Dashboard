/**
 * The /overview system strip: eight chips in a fixed order, live color over
 * shadow (shadow drawn hollow), a system with no checks grey "no checks",
 * never green.
 */
import { describe, expect, it } from "vitest";
import { countsNote, dotClass, shapeSystemStrip, SYSTEMS } from "./systemStatus.core";

const row = (system: string, color: string, red = 0, yellow = 0, green = 0) => ({ system, color, red, yellow, green, last_observed_at: "2026-10-15T14:00:00Z" });

describe("shapeSystemStrip", () => {
  it("always returns the eight systems in order", () => {
    expect(shapeSystemStrip([], []).map((c) => c.id)).toEqual(SYSTEMS.map((s) => s.id));
  });
  it("a missing system is grey 'no checks', never green", () => {
    const five9 = shapeSystemStrip([], [])[1]!;
    expect(five9.color).toBe("grey");
    expect(five9.note).toBe("no checks");
  });
  it("shadow only → hollow; live wins when present", () => {
    const chips = shapeSystemStrip([row("five9", "green", 0, 0, 3)], [row("five9", "red", 1, 0, 2), row("ghl", "yellow", 0, 2, 1)]);
    const five9 = chips.find((c) => c.id === "five9")!;
    const ghl = chips.find((c) => c.id === "ghl")!;
    expect(five9).toMatchObject({ color: "green", hollow: false, note: "all green" });
    expect(ghl).toMatchObject({ color: "yellow", hollow: true, note: "2 yellow (shadow)" });
  });
  it("counts and dot classes", () => {
    expect(countsNote(3, 2, 0)).toBe("3 red, 2 yellow");
    expect(dotClass("red", false)).toContain("bg-rose-500");
    expect(dotClass("red", true)).toContain("ring-rose-500");
  });
});
