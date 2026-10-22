import { describe, expect, it } from "vitest";
import { fdate, isPositive, money, num } from "@/ui/format";

describe("money", () => {
  it("formats decimal strings with grouping and 2dp", () => {
    expect(money("1234.5")).toBe("$1,234.50");
    expect(money("1000000")).toBe("$1,000,000.00");
    expect(money("0")).toBe("$0.00");
  });

  it("rounds HALF_UP on the decimal string (no float error)", () => {
    // 1.005 is 1.00499999… as a float; the decimal string must round up.
    expect(money("1.005")).toBe("$1.01");
    expect(money("2.675")).toBe("$2.68");
    expect(money("0.004")).toBe("$0.00");
  });

  it("uses the design's minus sign for negatives and drops negative zero", () => {
    expect(money("-12.3")).toBe("−$12.30");
    expect(money("-0.001")).toBe("$0.00");
  });

  it("accepts Decimal-like objects and numbers", () => {
    expect(money({ toString: () => "99.9" })).toBe("$99.90");
    expect(money(12)).toBe("$12.00");
  });

  it("treats empty and malformed input as zero", () => {
    expect(money(null)).toBe("$0.00");
    expect(money("abc")).toBe("$0.00");
  });
});

describe("num", () => {
  it("groups and fixes decimals", () => {
    expect(num("1240.5", 1)).toBe("1,240.5");
    expect(num("38.45", 1)).toBe("38.5");
    expect(num("24")).toBe("24");
  });
});

describe("fdate", () => {
  it("formats ISO dates as en-GB in UTC", () => {
    expect(fdate("2026-10-02")).toBe("02 Oct 2026");
    expect(fdate(new Date("2026-01-15T23:30:00Z"))).toBe("15 Jan 2026");
  });

  it("returns an em dash for empty or invalid input", () => {
    expect(fdate("")).toBe("—");
    expect(fdate(null)).toBe("—");
    expect(fdate("not a date")).toBe("—");
  });
});

describe("isPositive", () => {
  it("detects balances above zero without float conversion", () => {
    expect(isPositive("0.01")).toBe(true);
    expect(isPositive("0.00")).toBe(false);
    expect(isPositive("0.004")).toBe(false);
    expect(isPositive("-5")).toBe(false);
  });
});
