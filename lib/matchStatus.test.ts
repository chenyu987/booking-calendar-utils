import { describe, it, expect } from "vitest";
import { matchDisplay, isOpenMatch, isStaleMatch, MATCH_STATUSES } from "./matchStatus";

describe("matchDisplay", () => {
  it("四个状态都有中文说法", () => {
    for (const s of MATCH_STATUSES) {
      expect(matchDisplay(s).label).not.toBe(s);
      expect(matchDisplay(s).label.length).toBeGreaterThan(0);
    }
  });

  it("认不出来的状态照原样显示，不猜", () => {
    // 库里哪天多一个状态，宁可露出个英文词，也不能糊成「成了」
    expect(matchDisplay("somethingNew").label).toBe("somethingNew");
  });
});

describe("isOpenMatch", () => {
  it("还要等的是 proposed 和 allowed", () => {
    expect(isOpenMatch("proposed")).toBe(true);
    expect(isOpenMatch("allowed")).toBe(true);
  });

  it("已经有结果的不算", () => {
    expect(isOpenMatch("chosen")).toBe(false);
    expect(isOpenMatch("unfulfilled")).toBe(false);
  });
});

// 中标的那条也可能退单 —— 行程开始之前，其余几条是后备池，随时能顶上去。
// 所以「落空」看的是那一单开没开始，不是「有没有人被选中」
describe("isStaleMatch", () => {
  const today = "2026-09-15";

  it("那一单还没开始：留着当后备，不落空", () => {
    expect(isStaleMatch("proposed", "2026-09-20", today)).toBe(false);
    expect(isStaleMatch("allowed", "2026-09-16", today)).toBe(false);
  });

  it("到了那一单开始那天，就落空了", () => {
    expect(isStaleMatch("proposed", today, today)).toBe(true);
    expect(isStaleMatch("proposed", "2026-09-10", today)).toBe(true);
  });

  it("已经有结果的不受影响 —— chosen 是事实，unfulfilled 已经落定", () => {
    expect(isStaleMatch("chosen", "2026-09-01", today)).toBe(false);
    expect(isStaleMatch("unfulfilled", "2026-09-01", today)).toBe(false);
  });

  it("订单没填日期就判断不了，不落空 —— 宁可让它挂着，也不能凭空判死", () => {
    expect(isStaleMatch("proposed", "", today)).toBe(false);
  });
});

describe("matchDisplay 落空的说法", () => {
  it("库里还是 proposed，但那一单开始了，就不能再跟物主说「等确认」", () => {
    const d = matchDisplay("proposed", true);
    expect(d.label).toBe("没成");
    expect(d.hint).toContain("已经开始");
  });

  it("stale 对已经有结果的不起作用", () => {
    expect(matchDisplay("chosen", true).label).toBe("成了");
  });
});
