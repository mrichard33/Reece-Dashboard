import { describe, expect, it } from "vitest";
import { STEPS } from "./calculatorMetrics";

/**
 * The calculator funnel's event vocabulary.
 *
 * THE DEFECT THIS GUARDS (2026-09-16). `verify_cta_clicked` sat in this list
 * and has never been emitted — zero rows since the table was created, verified
 * against live HL Supabase. So the last stage of the funnel could only ever
 * render zero, and the Page Metrics screen reported that nobody asks for exact
 * pricing while eight sessions had actually completed email verification.
 *
 * A stage that is structurally zero and a stage where nothing happened look
 * identical on a bar chart. That is the same class of bug as an empty Command
 * Center lane meaning "migration missing" — which is why the fix was to remove
 * the stage rather than leave it reading zero.
 *
 * Counts measured on 2026-09-16 over the whole table:
 *   step_view 114 · page_view 79 · window_added 27 · step1_complete 11 ·
 *   step3_complete 9 · verify_sent 9 · verify_success 9 ·
 *   estimate_completed 8 · verify_cta_clicked 0
 */

describe("calculator funnel vocabulary", () => {
  it("never counts verify_cta_clicked again", () => {
    // Re-adding it would restore a permanently-zero funnel stage.
    expect(STEPS).not.toContain("verify_cta_clicked");
  });

  it("ends on the two events that answer whether verification works", () => {
    expect(STEPS).toContain("verify_sent");
    expect(STEPS).toContain("verify_success");
    // Sent must precede succeeded, because the bars render in array order and a
    // funnel that ends on the wider number reads as growth.
    expect(STEPS.indexOf("verify_sent")).toBeLessThan(STEPS.indexOf("verify_success"));
  });

  it("is ordered widest to narrowest, which is what makes the drop-off readable", () => {
    expect([...STEPS]).toEqual([
      "page_view",
      "step1_complete",
      "window_added",
      "step3_complete",
      "estimate_completed",
      "verify_sent",
      "verify_success",
    ]);
  });

  it("contains only events the calculator actually emits", () => {
    // Confirmed present in estimator_events on 2026-09-16. step_view is emitted
    // and deliberately not counted: it fires on every step including the first,
    // so it is traffic, not a funnel stage.
    const emitted = new Set([
      "page_view", "step_view", "step1_complete", "window_added", "step3_complete",
      "estimate_completed", "consent_checked", "verify_sent", "verify_success",
    ]);
    for (const step of STEPS) {
      expect(emitted.has(step), `${step} is counted but never emitted`).toBe(true);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(STEPS).size).toBe(STEPS.length);
  });
});
