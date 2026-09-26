/**
 * Every dashboard screen must work on a phone (ruling 2026-09-26). This walks
 * app/ and components/ and fails on the layouts that break at phone width.
 * Fix the layout; if a line truly cannot change, put `mobile-ok: <reason>` on
 * it. Do not add the file to SKIP to make this pass.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { scanForPhoneBreaks } from "./mobileGuard";

const ROOT = join(__dirname, "..", "..");

// Not dashboard screens: a fixed-size TV kiosk, and design references that
// are never built or served.
const SKIP = [/^app\/board\/tv\//, /design-export/, /^prototype\//];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("scanForPhoneBreaks", () => {
  it("flags three columns with no phone fallback", () => {
    expect(scanForPhoneBreaks(`<div className="grid grid-cols-3 gap-2">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="grid grid-cols-[8rem_1fr_1fr]">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="grid grid-cols-1 sm:grid-cols-3">`)).toEqual([]);
    expect(scanForPhoneBreaks(`<div className="grid grid-cols-2">`)).toEqual([]);
  });

  it("flags a fixed width wider than a phone", () => {
    expect(scanForPhoneBreaks(`<div className="w-[600px]">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="min-w-[40rem]">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="w-96">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="w-full sm:w-96">`)).toEqual([]);
    expect(scanForPhoneBreaks(`<div className="w-80 max-w-[600px] w-1/2 min-w-0">`)).toEqual([]);
  });

  it("flags a table that cannot scroll sideways", () => {
    expect(scanForPhoneBreaks(`<table className="min-w-[64rem]">`)).toHaveLength(1);
    expect(scanForPhoneBreaks(`<div className="overflow-x-auto">\n<table className="min-w-[64rem]">`)).toEqual([]);
  });

  it("honours a mobile-ok note on the line or the line above", () => {
    expect(scanForPhoneBreaks(`<div className="w-[600px]"> {/* mobile-ok: canvas pans */}`)).toEqual([]);
    expect(scanForPhoneBreaks(`{/* mobile-ok: canvas pans */}\n<div className="w-[600px]">`)).toEqual([]);
  });
});

describe("every dashboard screen fits a phone", () => {
  const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))]
    .map((p) => relative(ROOT, p).split("\\").join("/"))
    .filter((p) => !SKIP.some((re) => re.test(p)));

  it("finds the screens to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no layout that breaks at phone width", () => {
    const findings = files.flatMap((file) =>
      scanForPhoneBreaks(readFileSync(join(ROOT, file), "utf8")).map((f) => `${file}:${f.line}  ${f.rule}  (${f.text})`),
    );
    expect(findings, `Phone layout problems — fix them, or mark a line "mobile-ok: <reason>":\n${findings.join("\n")}`).toEqual([]);
  });
});
