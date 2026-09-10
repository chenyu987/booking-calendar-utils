import { describe, it, expect } from "vitest";
import {
  parseOrderFilters,
  hasAnyFilter,
  matchesOrderFilters,
  EMPTY_FILTERS,
  type FilterableOrder,
} from "./orderFilter";

const base: FilterableOrder = {
  customerName: "laura kim",
  location: "Locbl",
  maleCount: 1,
  femaleCount: 1,
  demandDays: ["2026-09-10", "2026-09-11"],
  amount: 140,
  status: "complete",
  assignedCount: 2,
  isComplete: true,
};
const f = (over: Partial<typeof EMPTY_FILTERS>) => ({ ...EMPTY_FILTERS, ...over });

describe("parseOrderFilters", () => {
  it("认不出来的值当没筛，不报错", () => {
    const got = parseOrderFilters({ party: "外星人", assign: "???" });
    expect(got.party).toBe("");
    expect(got.assign).toBe("");
  });

  it("两边空格去掉", () => {
    expect(parseOrderFilters({ customer: "  kim  " }).customer).toBe("kim");
  });

  it("金额用的是 min/max 两个参数名", () => {
    const got = parseOrderFilters({ min: "100", max: "200" });
    expect(got.minAmount).toBe("100");
    expect(got.maxAmount).toBe("200");
  });
});

describe("hasAnyFilter", () => {
  it("全空就是没筛", () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
  it("任意一个有值就算筛了", () => {
    expect(hasAnyFilter(f({ status: "created" }))).toBe(true);
  });
});

describe("matchesOrderFilters", () => {
  it("没有任何筛选时全都留下", () => {
    expect(matchesOrderFilters(base, EMPTY_FILTERS)).toBe(true);
  });

  it("客人姓名是包含匹配，且不分大小写", () => {
    expect(matchesOrderFilters(base, f({ customer: "KIM" }))).toBe(true);
    expect(matchesOrderFilters(base, f({ customer: "zhang" }))).toBe(false);
  });

  it("地点不分大小写——locbl 和 Locbl 是一个地方", () => {
    expect(matchesOrderFilters(base, f({ location: "locbl" }))).toBe(true);
  });

  it("地点没填的单子，一按地点筛就不出现", () => {
    expect(matchesOrderFilters({ ...base, location: null }, f({ location: "peri" }))).toBe(false);
  });

  describe("人数", () => {
    const male = { ...base, maleCount: 2, femaleCount: 0 };
    it("有男", () => {
      expect(matchesOrderFilters(male, f({ party: "male" }))).toBe(true);
      expect(matchesOrderFilters({ ...base, maleCount: 0 }, f({ party: "male" }))).toBe(false);
    });
    it("男女都有", () => {
      expect(matchesOrderFilters(base, f({ party: "both" }))).toBe(true);
      expect(matchesOrderFilters(male, f({ party: "both" }))).toBe(false);
    });
  });

  describe("日期", () => {
    it("只要有一天落在区间里就算命中", () => {
      expect(matchesOrderFilters(base, f({ from: "2026-09-11", to: "2026-09-20" }))).toBe(true);
    });
    it("整段都在区间外就不命中", () => {
      expect(matchesOrderFilters(base, f({ from: "2026-10-01" }))).toBe(false);
    });
    it("只填起点是单边开区间", () => {
      expect(matchesOrderFilters(base, f({ from: "2026-09-01" }))).toBe(true);
    });
    it("只填终点也一样", () => {
      expect(matchesOrderFilters(base, f({ to: "2026-09-10" }))).toBe(true);
      expect(matchesOrderFilters(base, f({ to: "2026-09-09" }))).toBe(false);
    });
    it("不连续的日期按「有交集」判，不是按起止点", () => {
      const gap = { ...base, demandDays: ["2026-09-01", "2026-09-30"] };
      // 起止点是 9/1 和 9/30，但中间这一段其实一天都没有
      expect(matchesOrderFilters(gap, f({ from: "2026-09-10", to: "2026-09-20" }))).toBe(false);
      expect(matchesOrderFilters(gap, f({ from: "2026-09-29" }))).toBe(true);
    });
  });

  describe("金额", () => {
    it("上下限都判", () => {
      expect(matchesOrderFilters(base, f({ minAmount: "100", maxAmount: "200" }))).toBe(true);
      expect(matchesOrderFilters(base, f({ minAmount: "200" }))).toBe(false);
      expect(matchesOrderFilters(base, f({ maxAmount: "100" }))).toBe(false);
    });
    it("金额没填的单子，一按金额筛就不出现——它答不上这个问题", () => {
      expect(matchesOrderFilters({ ...base, amount: null }, f({ minAmount: "1" }))).toBe(false);
    });
    it("输了非数字就当这一头没填，别把列表整个筛空", () => {
      // 金额框是普通文本框，手滑输进字母是可能的
      expect(matchesOrderFilters(base, f({ minAmount: "abc" }))).toBe(true);
      expect(matchesOrderFilters(base, f({ minAmount: "abc", maxAmount: "100" }))).toBe(false);
      expect(matchesOrderFilters(base, f({ minAmount: "abc", maxAmount: "200" }))).toBe(true);
    });

    it("但不按金额筛的时候，金额没填的照常出现", () => {
      expect(matchesOrderFilters({ ...base, amount: null }, EMPTY_FILTERS)).toBe(true);
    });
  });

  describe("分配进度", () => {
    const none = { ...base, assignedCount: 0, isComplete: false };
    const partial = { ...base, assignedCount: 1, isComplete: false };
    it("未分配", () => {
      expect(matchesOrderFilters(none, f({ assign: "none" }))).toBe(true);
      expect(matchesOrderFilters(partial, f({ assign: "none" }))).toBe(false);
    });
    it("配了一半", () => {
      expect(matchesOrderFilters(partial, f({ assign: "partial" }))).toBe(true);
      expect(matchesOrderFilters(none, f({ assign: "partial" }))).toBe(false);
      expect(matchesOrderFilters(base, f({ assign: "partial" }))).toBe(false);
    });
    it("已配齐", () => {
      expect(matchesOrderFilters(base, f({ assign: "full" }))).toBe(true);
      expect(matchesOrderFilters(partial, f({ assign: "full" }))).toBe(false);
    });

    it("人数还没填的单子不算已配齐——否则它会同时落进未分配和已配齐", () => {
      const blank = {
        ...base,
        maleCount: 0,
        femaleCount: 0,
        assignedCount: 0,
        isComplete: true, // computeNeed 对「要 0 张」就是这么算的
      };
      expect(matchesOrderFilters(blank, f({ assign: "full" }))).toBe(false);
      expect(matchesOrderFilters(blank, f({ assign: "none" }))).toBe(true);
      expect(matchesOrderFilters(blank, f({ assign: "partial" }))).toBe(false);
    });
  });

  it("状态是精确匹配", () => {
    expect(matchesOrderFilters(base, f({ status: "complete" }))).toBe(true);
    expect(matchesOrderFilters(base, f({ status: "created" }))).toBe(false);
  });

  it("多个条件是「而且」的关系", () => {
    expect(matchesOrderFilters(base, f({ customer: "kim", status: "complete" }))).toBe(true);
    expect(matchesOrderFilters(base, f({ customer: "kim", status: "created" }))).toBe(false);
  });
});
