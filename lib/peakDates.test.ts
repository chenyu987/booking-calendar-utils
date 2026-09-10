import { describe, it, expect } from "vitest";
import { isPeakDate, countPeakDays } from "./peakDates";

describe("isPeakDate", () => {
  it("单独一天的那一档，就那天算", () => {
    expect(isPeakDate("2027-01-16")).toBe(true);
    expect(isPeakDate("2027-01-15")).toBe(false);
    expect(isPeakDate("2027-01-17")).toBe(false);
  });

  it("区间包含首尾两端", () => {
    expect(isPeakDate("2026-12-26")).toBe(true);
    expect(isPeakDate("2026-12-31")).toBe(true);
    expect(isPeakDate("2026-12-28")).toBe(true);
    expect(isPeakDate("2026-12-25")).toBe(false);
    expect(isPeakDate("2027-01-01")).toBe(false); // 元旦当天不在限制里
  });

  it("感恩节和总统日那两段", () => {
    expect(isPeakDate("2026-11-27")).toBe(true);
    expect(isPeakDate("2026-11-28")).toBe(true);
    expect(isPeakDate("2026-11-26")).toBe(false); // 感恩节当天反倒不限制
    expect(isPeakDate("2027-02-13")).toBe(true);
    expect(isPeakDate("2027-02-14")).toBe(true);
  });

  it("季之外一律不是", () => {
    expect(isPeakDate("2026-09-10")).toBe(false);
    expect(isPeakDate("2027-12-26")).toBe(false); // 下一季的日子还没录进来
  });
});

describe("countPeakDays", () => {
  it("数出订单里踩了几天 peak", () => {
    expect(countPeakDays(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"])).toBe(2);
    expect(countPeakDays(["2026-12-24", "2026-12-25"])).toBe(0);
    expect(countPeakDays([])).toBe(0);
  });
});
