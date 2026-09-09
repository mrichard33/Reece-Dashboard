import { describe, it, expect } from "vitest";
import { mergeBoardOffices } from "@/lib/scorecard/boardOffices";

const office = (over: Partial<Record<string, unknown>> = {}) => ({
  market: "SAR_MKT", office_label: "Sarasota",
  requested: 10, booked: 5, confirmed: 5, set_pending: 2, fill_pct: 50,
  ...over,
});

describe("dial_rank survives the board office merge", () => {
  it("carries dial_rank through untouched", () => {
    const out = mergeBoardOffices([office({ dial_rank: 2 })] as never);
    expect((out[0] as never as { dial_rank: number }).dial_rank).toBe(2);
  });

  it("keeps the first row's rank when two rows collapse onto one market", () => {
    const out = mergeBoardOffices([
      office({ dial_rank: 2 }),
      office({ dial_rank: 2, requested: 4, confirmed: 1 }),
    ] as never);
    expect(out).toHaveLength(1);
    expect((out[0] as never as { dial_rank: number }).dial_rank).toBe(2);
    expect(out[0]?.requested).toBe(14);
  });
});
