import { describe, it, expect } from "vitest";
import {
  compareResources,
  parseResourceSort,
  DEFAULT_RESOURCE_SORT,
  RESOURCE_SORTS,
  type SortableResource,
  type ResourceSort,
} from "./resourceSort";

const s = (
  name: string,
  dateOfBirth: string | null,
  timesBooked = 0,
  daysBooked = 0
): SortableResource => ({ name, dateOfBirth, timesBooked, daysBooked });

const order = (sort: ResourceSort, xs: SortableResource[]) =>
  [...xs].sort(compareResources(sort)).map((x) => x.name);

describe("parseResourceSort", () => {
  it("认识的照收", () => {
    for (const k of Object.keys(RESOURCE_SORTS)) {
      expect(parseResourceSort(k)).toBe(k);
    }
  });
  it("不认识的、空的都退回默认", () => {
    expect(parseResourceSort("随便")).toBe(DEFAULT_RESOURCE_SORT);
    expect(parseResourceSort("")).toBe(DEFAULT_RESOURCE_SORT);
    expect(parseResourceSort(null)).toBe(DEFAULT_RESOURCE_SORT);
    expect(parseResourceSort(undefined)).toBe(DEFAULT_RESOURCE_SORT);
  });
});

describe("按年龄", () => {
  const xs = [s("老", "1997-03-19"), s("小", "2002-10-03"), s("中", "1999-04-16")];

  it("小 → 大：生日晚的在前", () => {
    expect(order("age-asc", xs)).toEqual(["小", "中", "老"]);
  });

  it("大 → 小：反过来", () => {
    expect(order("age-desc", xs)).toEqual(["老", "中", "小"]);
  });

  it("生日没填的沉底 —— 升序降序都沉底", () => {
    const ys = [s("没填", null), ...xs];
    expect(order("age-asc", ys)).toEqual(["小", "中", "老", "没填"]);
    expect(order("age-desc", ys)).toEqual(["老", "中", "小", "没填"]);
  });

  it("**不靠算年龄**：同岁但差一天也分得出先后", () => {
    expect(order("age-asc", [s("晚一天", "1999-01-02"), s("早一天", "1999-01-01")]))
      .toEqual(["晚一天", "早一天"]);
  });

  it("同一天生日按名字兜底 —— 每次刷新顺序要一样", () => {
    expect(order("age-asc", [s("zolan", "1999-04-16"), s("oshn", "1999-04-16")]))
      .toEqual(["oshn", "zolan"]);
  });
});

describe("按出借频率", () => {
  it("排得多的在前", () => {
    expect(order("freq-desc", [s("一次", "1999-01-01", 1), s("五次", "1999-01-01", 5), s("没排过", "1999-01-01", 0)]))
      .toEqual(["五次", "一次", "没排过"]);
  });

  it("排得少的在前 —— 用来把生意匀开", () => {
    expect(order("freq-asc", [s("一次", "1999-01-01", 1), s("五次", "1999-01-01", 5), s("没排过", "1999-01-01", 0)]))
      .toEqual(["没排过", "一次", "五次"]);
  });

  it("次数一样看天数：两次共十天的排在两次共两天前面", () => {
    expect(order("freq-desc", [s("两次两天", "1999-01-01", 2, 2), s("两次十天", "1999-01-01", 2, 10)]))
      .toEqual(["两次十天", "两次两天"]);
  });

  it("次数天数都一样按名字兜底", () => {
    expect(order("freq-desc", [s("b", "1999-01-01", 2, 2), s("a", "1999-01-01", 2, 2)]))
      .toEqual(["a", "b"]);
  });

  it("按频率排的时候不看生日 —— 没填生日的也不该沉底", () => {
    expect(order("freq-desc", [s("没生日排五次", null, 5), s("有生日排一次", "1999-01-01", 1)]))
      .toEqual(["没生日排五次", "有生日排一次"]);
  });
});
