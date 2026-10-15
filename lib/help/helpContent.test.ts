/**
 * Help entries are the page's explanation of itself (components/help/helpContent.ts:
 * "new tiles MUST add an entry before shipping"). This guards that rule:
 *   - no entry says TODO / TBD or is left blank;
 *   - every literal helpKey used in app/ and components/ exists (a missing key
 *     renders a silent nothing), and every System Health system has its entry.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { helpContent } from "@/components/help/helpContent";
import { SYSTEMS } from "@/lib/queries/systemStatus.core";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("helpContent", () => {
  it("has no TODO, TBD or blank entries", () => {
    for (const [key, e] of Object.entries(helpContent)) {
      for (const field of ["title", "what", "where", "fix"] as const) {
        const v = e[field];
        expect(typeof v === "string" && v.trim().length > 0, `${key}.${field} is blank`).toBe(true);
        expect(/\bTODO\b|\bTBD\b/i.test(v), `${key}.${field} says TODO`).toBe(false);
      }
    }
  });

  it("every literal helpKey used in a page or component exists", () => {
    const root = path.resolve(__dirname, "../..");
    const missing: string[] = [];
    for (const file of [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/helpKey=["']([^"']+)["']/g)) {
        const key = m[1] ?? "";
        if (!helpContent[key]) missing.push(`${path.relative(root, file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every system on /system-health has its entry", () => {
    for (const s of SYSTEMS) expect(helpContent[`systemHealth.system.${s.id}`], s.id).toBeTruthy();
  });
});
