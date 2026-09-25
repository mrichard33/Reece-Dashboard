/**
 * The review data must always be readable: every entry valid, ids unique,
 * meta counts true, and the stale rule right. A bad file fails here, not on
 * the page (index.ts drops it with a warning).
 */
import { describe, expect, it } from "vitest";
import data from "./data.json";
import meta from "./meta.json";
import { insightsMetaSchema, isStale, workflowInsightSchema } from "./schema";

describe("insights data", () => {
  it("every workflow entry parses and has unique step ids", () => {
    const ids = new Set<string>();
    for (const item of data) {
      const r = workflowInsightSchema.safeParse(item);
      expect(r.success, r.success ? "" : `${(item as { code?: string }).code}: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`).toBe(true);
      if (!r.success) continue;
      expect(ids.has(r.data.ghlWorkflowId), `duplicate ${r.data.code}`).toBe(false);
      ids.add(r.data.ghlWorkflowId);
      const steps = r.data.messages.map((m) => m.stepId);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });

  it("meta counts match the data", () => {
    const m = insightsMetaSchema.parse(meta);
    expect(m.workflows).toBe(data.length);
    expect(m.messages).toBe(data.reduce((n, w) => n + (w as { messages: unknown[] }).messages.length, 0));
  });
});

describe("isStale", () => {
  it("is stale only when the live version moved past the reviewed one", () => {
    expect(isStale({ analysed_version: 12 }, 14)).toBe(true);
    expect(isStale({ analysed_version: 12 }, 12)).toBe(false);
    expect(isStale({ analysed_version: null }, 14)).toBe(false);
    expect(isStale({ analysed_version: 12 }, null)).toBe(false);
  });
});
