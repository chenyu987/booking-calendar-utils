import { describe, it, expect } from "vitest";
import { rescaleAmount, amountAfterEdit, computeTotalFromPerDay, defaultDayPrice, autoTotal } from "./pricing";

const d = (days: number, party = 1) => ({ days, party });

describe("rescaleAmount", () => {
  it("2天 80 块，改成 1 天变 40", () => {
    expect(rescaleAmount(80, d(2), d(1))).toBe(40);
  });

  it("天数变多按比例涨价", () => {
    expect(rescaleAmount(100, d(2), d(3))).toBe(150);
  });

  it("人数从 1 加到 2，总价翻倍", () => {
    expect(rescaleAmount(80, d(2, 1), d(2, 2))).toBe(160);
  });

  it("天数和人数一起变：3 天 2 人 240 → 2 天 3 人 240（每人每天 40）", () => {
    expect(rescaleAmount(240, d(3, 2), d(2, 3))).toBe(240);
  });

  it("总价是 null 就保持 null", () => {
    expect(rescaleAmount(null, d(2), d(3))).toBeNull();
  });

  it("旧天数是 0（没有 demand_days）时不做计算，原样返回", () => {
    expect(rescaleAmount(100, d(0), d(3))).toBe(100);
  });

  it("旧人数是 0 时不做计算，原样返回", () => {
    expect(rescaleAmount(100, d(2, 0), d(2, 1))).toBe(100);
  });

  it("结果四舍五入到分", () => {
    expect(rescaleAmount(100, d(3), d(1))).toBe(33.33);
  });
});

describe("amountAfterEdit", () => {
  const old = { days: 2, party: 1, amount: 80 };

  it("没填金额：按天数人数重算", () => {
    expect(amountAfterEdit(old, d(3, 2))).toBe(240);
  });

  it("填的金额跟原来一样（没动）：照样重算", () => {
    expect(amountAfterEdit(old, d(2, 2), 80)).toBe(160);
  });

  it("**手动改了金额：以手填的为准**，不再按比例乘", () => {
    expect(amountAfterEdit(old, d(2, 2), 150)).toBe(150);
  });

  it("手动清空金额：存 null", () => {
    expect(amountAfterEdit(old, d(2, 2), null)).toBeNull();
  });

  it("天数人数都没变：金额不变", () => {
    expect(amountAfterEdit(old, d(2, 1), 80)).toBe(80);
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
