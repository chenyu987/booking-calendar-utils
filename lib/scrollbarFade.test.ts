import { describe, it, expect } from "vitest";
import { fadeAlpha, HOLD_MS, FADE_MS, PEAK_ALPHA } from "./scrollbarFade";

describe("fadeAlpha", () => {
  it("停手那一段原样不动", () => {
    expect(fadeAlpha(0)).toBe(PEAK_ALPHA);
    expect(fadeAlpha(HOLD_MS - 1)).toBe(PEAK_ALPHA);
    expect(fadeAlpha(HOLD_MS)).toBe(PEAK_ALPHA);
  });

  it("过了停手那段才开始淡，中间是连续的", () => {
    const mid = fadeAlpha(HOLD_MS + FADE_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(PEAK_ALPHA);
    expect(mid).toBeCloseTo(PEAK_ALPHA / 2, 5);
  });

  it("单调往下走，不会回头", () => {
    let prev = Infinity;
    for (let t = 0; t <= HOLD_MS + FADE_MS + 500; t += 137) {
      const a = fadeAlpha(t);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it("淡完就是 0，之后一直是 0", () => {
    expect(fadeAlpha(HOLD_MS + FADE_MS)).toBe(0);
    expect(fadeAlpha(HOLD_MS + FADE_MS + 99999)).toBe(0);
  });

  it("时间倒着走（坏值）按刚滚过算，不会闪一下", () => {
    expect(fadeAlpha(-100)).toBe(PEAK_ALPHA);
    expect(fadeAlpha(NaN)).toBe(PEAK_ALPHA);
  });

  it("淡出时长是 0 就直接不见，不会除以零", () => {
    expect(fadeAlpha(HOLD_MS + 1, HOLD_MS, 0)).toBe(0);
  });
});
