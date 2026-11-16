import { describe, it, expect } from "vitest";
import { rescaleAmount, computeTotalFromPerDay, defaultDayPrice, autoTotal } from "./pricing";

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

describe("新建单预填的每天单价（设置里 Alpha 40 / Beta 50）", () => {
  const prices = { alpha: 40, beta: 50 };

  it("按地点：Alpha 的地点 40，Beta 的地点 50，不管开关切在哪", () => {
    expect(defaultDayPrice("locaa", "", prices)).toBe(40);
    expect(defaultDayPrice("locbp", "", prices)).toBe(50);
    expect(defaultDayPrice("locbp", "alpha", prices)).toBe(50);
  });

  it("地点没填 / 认不出来：看 Alpha / Beta 开关；开关在「全部」就不猜", () => {
    expect(defaultDayPrice("", "beta", prices)).toBe(50);
    expect(defaultDayPrice("111", "alpha", prices)).toBe(40);
    expect(defaultDayPrice("", "", prices)).toBeNull();
  });

  it("那边没设价 → 不预填", () => {
    expect(defaultDayPrice("locbp", "", { alpha: 40, beta: null })).toBeNull();
  });
});

describe("自动总价", () => {
  it("单价 × 天数 × 人数", () => {
    expect(autoTotal("40", 3, 2)).toBe("240");
  });

  it("人数、天数、单价缺一样就空着，不算出 $0", () => {
    expect(autoTotal("40", 3, 0)).toBeNull();
    expect(autoTotal("40", 0, 2)).toBeNull();
    expect(autoTotal("", 3, 2)).toBeNull();
    expect(autoTotal("abc", 3, 2)).toBeNull();
  });
});
