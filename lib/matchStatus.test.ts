import { describe, it, expect } from "vitest";
import { matchDisplay, isOpenMatch, MATCH_STATUSES } from "./matchStatus";

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
