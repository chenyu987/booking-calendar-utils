import { describe, it, expect } from "vitest";
import { rescaleAmount, computeTotalFromPerDay } from "./pricing";

describe("rescaleAmount", () => {
  it("2天 80 块，改成 1 天变 40", () => {
    expect(rescaleAmount(80, 2, 1)).toBe(40);
  });

  it("天数变多按比例涨价", () => {
    expect(rescaleAmount(100, 2, 3)).toBe(150);
  });

  it("总价是 null 就保持 null", () => {
    expect(rescaleAmount(null, 2, 3)).toBeNull();
  });

  it("旧天数是 0（没有 demand_days）时不做计算，原样返回", () => {
    expect(rescaleAmount(100, 0, 3)).toBe(100);
  });

  it("结果四舍五入到分", () => {
    expect(rescaleAmount(100, 3, 1)).toBe(33.33);
  });
});

describe("computeTotalFromPerDay", () => {
  it("单价 × 天数 × 人数", () => {
    expect(computeTotalFromPerDay(50, 2, 3)).toBe(300);
  });

  it("人数是 0 总价就是 0", () => {
    expect(computeTotalFromPerDay(50, 2, 0)).toBe(0);
  });

  it("结果四舍五入到分", () => {
    expect(computeTotalFromPerDay(33.333, 1, 1)).toBe(33.33);
  });
});
