import { describe, it, expect } from "vitest";
import {
  clampBandDays,
  bandDaysForWidth,
  widthForBandDays,
  dragDelta,
  autoStepSpeed,
  clampRailWidth,
  RAIL_WIDTH,
  COL_WIDTH,
  COL_GAP,
  MIN_BAND_DAYS,
  MAX_BAND_DAYS,
  DEFAULT_BAND_DAYS,
} from "./bandDays";

describe("clampBandDays", () => {
  it("卡在 3 到 28 天之间", () => {
    expect(clampBandDays(0)).toBe(MIN_BAND_DAYS);
    expect(clampBandDays(100)).toBe(MAX_BAND_DAYS);
    expect(clampBandDays(11)).toBe(11);
  });

  it("坏值退回原来的四周，不会算出 0 列把渲染卡死", () => {
    expect(clampBandDays(NaN)).toBe(DEFAULT_BAND_DAYS);
  });

  it("不是周的倍数也行 —— 就是要精确到天", () => {
    expect(clampBandDays(11)).toBe(11);
    expect(clampBandDays(17)).toBe(17);
  });
});

describe("bandDaysForWidth", () => {
  const w = (n: number) => n * COL_WIDTH + (n - 1) * COL_GAP;

  it("正好够 n 列就排 n 列", () => {
    expect(bandDaysForWidth(w(5))).toBe(5);
    expect(bandDaysForWidth(w(11))).toBe(11);
  });

  it("差一点点不算：半列宁可空着，也不能把最后一天切一半", () => {
    expect(bandDaysForWidth(w(5) + COL_WIDTH - 1)).toBe(5);
    expect(bandDaysForWidth(w(6))).toBe(6);
  });

  it("多出来不到一列的空隙不影响", () => {
    expect(bandDaysForWidth(w(7) + 40)).toBe(7);
  });

  it("窄到离谱也留 3 天，宽到离谱也就 4 周", () => {
    expect(bandDaysForWidth(10)).toBe(MIN_BAND_DAYS);
    expect(bandDaysForWidth(99999)).toBe(MAX_BAND_DAYS);
  });

  it("跟着缩放走：缩到一半，同样的宽度能多排差不多一倍的天", () => {
    expect(bandDaysForWidth(w(6), 1)).toBe(6);
    // 不是正好 12：列之间的 gap 不跟着翻倍，第 12 列差那 2px
    expect(bandDaysForWidth(w(6), 0.5)).toBe(11);
    expect(bandDaysForWidth(w(12), 0.5)).toBe(23);
  });

  it("缩放是 0 这种坏值不返回 0 列", () => {
    expect(bandDaysForWidth(w(6), 0)).toBe(DEFAULT_BAND_DAYS);
  });
});

describe("widthForBandDays", () => {
  it("跟 bandDaysForWidth 对得上：算出来的宽度正好还排得下这么多天", () => {
    for (const n of [3, 7, 11, 20, 28]) {
      expect(bandDaysForWidth(widthForBandDays(n))).toBe(n);
    }
  });

  it("两头不算 gap", () => {
    expect(widthForBandDays(3)).toBe(3 * COL_WIDTH + 2 * COL_GAP);
  });
});

describe("dragDelta", () => {
  const step = COL_WIDTH + COL_GAP;

  it("往左拖一列宽就少一天，往右就多一天", () => {
    expect(dragDelta(-step)).toBe(-1);
    expect(dragDelta(step)).toBe(1);
    expect(dragDelta(-3 * step)).toBe(-3);
  });

  it("没拖过半列不算，过了半列就跳一整天 —— 一列一列地吃", () => {
    expect(dragDelta(-step * 0.4)).toBe(0);
    expect(dragDelta(-step * 0.6)).toBe(-1);
  });

  it("缩小之后一列在屏幕上更窄，同样的位移吃掉更多天", () => {
    expect(dragDelta(-3 * step, 1)).toBe(-3);
    expect(dragDelta(-3 * step, 0.5)).toBe(-6);
  });

  it("坏值当没拖，不会莫名其妙改天数", () => {
    expect(dragDelta(NaN)).toBe(0);
    expect(dragDelta(-step, 0)).toBe(0);
  });
});

describe("量不到宽度的时候", () => {
  it("宽度是 0 不能当成「只放得下 3 天」——那是页面没渲染，不是地方小", () => {
    expect(bandDaysForWidth(0)).toBe(DEFAULT_BAND_DAYS);
    expect(bandDaysForWidth(-100)).toBe(DEFAULT_BAND_DAYS);
    expect(bandDaysForWidth(NaN)).toBe(DEFAULT_BAND_DAYS);
  });
});

describe("autoStepSpeed", () => {
  const left = 400;
  const right = 1600;

  it("中间不动", () => {
    expect(autoStepSpeed(1000, left, right)).toBe(0);
  });

  it("靠左边减、靠右边加", () => {
    expect(autoStepSpeed(left + 10, left, right)).toBeLessThan(0);
    expect(autoStepSpeed(right - 10, left, right)).toBeGreaterThan(0);
  });

  it("越往边上压越快，压满封顶", () => {
    const shallow = autoStepSpeed(left + 50, left, right);
    const deep = autoStepSpeed(left + 5, left, right);
    expect(Math.abs(deep)).toBeGreaterThan(Math.abs(shallow));
    // 拖出边界外面不会越来越快到失控
    expect(autoStepSpeed(left - 9999, left, right)).toBe(
      autoStepSpeed(left - 56, left, right)
    );
  });

  it("刚进触发区就有速度，不是从 0 慢慢起", () => {
    // 从 0 起的话手感是「压了半天没反应」
    expect(Math.abs(autoStepSpeed(left + 55, left, right))).toBeGreaterThan(2);
  });

  it("坏参数一律不动", () => {
    expect(autoStepSpeed(NaN, left, right)).toBe(0);
    expect(autoStepSpeed(1000, 800, 800)).toBe(0);
    expect(autoStepSpeed(1000, left, right, 0)).toBe(0);
  });
});

describe("clampRailWidth", () => {
  it("中间状态原样留着，不吸到两头去", () => {
    expect(clampRailWidth(97)).toBe(97);
    expect(clampRailWidth(150)).toBe(150);
  });

  it("卡在 0 和整栏宽之间", () => {
    expect(clampRailWidth(-40)).toBe(0);
    expect(clampRailWidth(9999)).toBe(RAIL_WIDTH);
  });

  it("坏值退回整栏，不会莫名其妙收起来", () => {
    expect(clampRailWidth(NaN)).toBe(RAIL_WIDTH);
  });
});

describe("默认跟上限是两回事", () => {
  it("上限比默认宽 —— 想拖更开可以，但不该一进来就那样", () => {
    expect(MAX_BAND_DAYS).toBeGreaterThan(DEFAULT_BAND_DAYS);
  });

  it("拖得到上限", () => {
    expect(clampBandDays(MAX_BAND_DAYS)).toBe(MAX_BAND_DAYS);
    expect(clampBandDays(MAX_BAND_DAYS + 10)).toBe(MAX_BAND_DAYS);
    expect(bandDaysForWidth(widthForBandDays(MAX_BAND_DAYS))).toBe(MAX_BAND_DAYS);
  });

  it("**兜底一律回默认，不是回上限** —— 一有闪失就摊成一大片最难受", () => {
    expect(clampBandDays(NaN)).toBe(DEFAULT_BAND_DAYS);
    expect(bandDaysForWidth(0)).toBe(DEFAULT_BAND_DAYS);
  });
});
