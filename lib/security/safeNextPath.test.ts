import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/overview")).toBe("/overview");
    expect(safeNextPath("/leads?tab=new")).toBe("/leads?tab=new");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of ["@evil.com", ".evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "/\tx", "evil"]) {
      expect(safeNextPath(bad)).toBe("/overview");
    }
  });

  it("falls back when missing", () => {
    expect(safeNextPath(null)).toBe("/overview");
    expect(safeNextPath("", "/")).toBe("/");
  });
});
