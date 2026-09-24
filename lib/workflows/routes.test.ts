/**
 * Route grouping is how a person finds a workflow on the Workflows page. A
 * workflow filed under the wrong route is, in practice, missing.
 */
import { describe, expect, it } from "vitest";
import { familyOf, routeFor, ROUTES } from "./routes";

describe("routeFor", () => {
  it("files by registry family first", () => {
    expect(routeFor({ stageFamily: "S2", canonicalCode: "S2.1" })).toBe("indoctrination");
    expect(routeFor({ stageFamily: "E", canonicalCode: "E.0" })).toBe("entry");
    expect(routeFor({ stageFamily: "C", canonicalCode: "C.0" })).toBe("customer");
    expect(routeFor({ stageFamily: "S5", canonicalCode: "S5.1" })).toBe("lifecycle");
    expect(routeFor({ stageFamily: "U", canonicalCode: "U.SEND-AI" })).toBe("system");
  });

  it("falls back to the code, then the name, then Other", () => {
    expect(routeFor({ canonicalCode: "S3.1-E" })).toBe("positioning");
    expect(routeFor({ name: "A.WE-1 Window Estimate Reminders" })).toBe("appointments");
    expect(routeFor({ name: "Sale Made → GroupMe Celebration" })).toBe("other");
  });

  it("reads codes with suffixes and multi-letter families", () => {
    expect(familyOf("I.LP-IN")).toBe("I");
    expect(familyOf("S2.1-LEGACY-V2")).toBe("S2");
    expect(familyOf("EXT.LG")).toBe("EXT");
  });

  it("keeps the funnel order the route map draws", () => {
    expect(ROUTES.filter((r) => r.main).map((r) => r.key)).toEqual([
      "intake", "entry", "reengage", "indoctrination", "positioning", "booking", "appointments", "customer",
    ]);
  });
});
