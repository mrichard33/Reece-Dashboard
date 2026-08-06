import { describe, expect, test } from "vitest";
import { formatMoneyInput, num, parseMoney, usd, usdExact } from "./utils";

/**
 * §5/§6 (2026-08-05): the monthly-goal input rejected $2,731,306.68 — a real
 * office goal — because `<input type="number" step="1000">` enforces step
 * multiples, and every displayed figure must carry thousands separators from
 * ONE shared formatter.
 */

describe("parseMoney — accepts what a human types", () => {
  test("the rejected goal parses exactly", () => {
    expect(parseMoney("2,731,306.68")).toBe(2731306.68);
    expect(parseMoney("$2,731,306.68")).toBe(2731306.68);
    expect(parseMoney(" 2731306.68 ")).toBe(2731306.68);
    expect(parseMoney("$ 2,731,306.68 ")).toBe(2731306.68);
  });

  test("cents survive the round trip — no float artifact", () => {
    const round = parseMoney(formatMoneyInput(parseMoney("2,731,306.68")));
    expect(round).toBe(2731306.68);
    expect(String(round)).toBe("2731306.68");
  });

  test("blank and junk are null, not zero — 'unset' ≠ 'a $0 goal'", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("0")).toBe(0); // an explicit zero IS a value
  });

  test("mid-typing states don't throw or corrupt", () => {
    expect(parseMoney("1,2")).toBe(12);
    expect(parseMoney("1200.")).toBe(1200);
    expect(parseMoney(".5")).toBe(0.5);
  });
});

describe("formatMoneyInput — comma-grouped, cents only when present", () => {
  test("groups thousands", () => {
    expect(formatMoneyInput(2731306.68)).toBe("2,731,306.68");
    expect(formatMoneyInput(9000000)).toBe("9,000,000");
    expect(formatMoneyInput(0)).toBe("0");
  });
  test("null renders empty, never '0'", () => {
    expect(formatMoneyInput(null)).toBe("");
    expect(formatMoneyInput(undefined)).toBe("");
  });
});

describe("num / usd / usdExact — the shared display formatters (§6)", () => {
  test("every figure carries thousands separators", () => {
    expect(num(15441)).toBe("15,441");
    expect(num(1234567)).toBe("1,234,567");
    expect(usd(81110135)).toBe("$81,110,135");
    expect(usdExact(2731306.68)).toBe("$2,731,306.68");
    expect(usdExact(9000000)).toBe("$9,000,000");
  });
  test("null renders the em-dash, never 0", () => {
    expect(num(null)).toBe("—");
    expect(usd(null)).toBe("—");
    expect(usdExact(null)).toBe("—");
    expect(num(NaN)).toBe("—");
  });
});
