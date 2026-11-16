import { describe, it, expect } from "vitest";
import {
  parseResourceListSort,
  nextSort,
  sortParams,
  sortResourceRows,
  DEFAULT_RESOURCE_LIST_SORT,
  type SortableResourceRow,
  type ResourceListSort,
} from "./resourceListSort";

const row = (name: string, o: Partial<SortableResourceRow> = {}): SortableResourceRow & { name: string } => ({
  name,
  providerName: "Admin1",
  itemKind: "alpha",
  holderName: name,
  holderGender: "male",
  dob: null,
  validFrom: "2026-11-01",
  bookingCount: 0,
  badge: "active",
  ...o,
});
const names = (xs: { name: string }[]) => xs.map((x) => x.name);
const by = (s: ResourceListSort, xs: ReturnType<typeof row>[]) => names(sortResourceRows(xs, s, (r) => r));

describe("parseResourceListSort / nextSort", () => {
  it("认不出的当没排", () => {
    expect(parseResourceListSort({ sort: "bogus", dir: "desc" })).toEqual(DEFAULT_RESOURCE_LIST_SORT);
    expect(parseResourceListSort({})).toEqual(DEFAULT_RESOURCE_LIST_SORT);
  });
  it("dir 只认 desc，别的都是 asc", () => {
    expect(parseResourceListSort({ sort: "age", dir: "x" })).toEqual({ sort: "age", dir: "asc" });
    expect(parseResourceListSort({ sort: "age", dir: "desc" })).toEqual({ sort: "age", dir: "desc" });
  });
  it("点同一列：升 → 降 → 回默认；点别的列从升序开始", () => {
    const a = nextSort(DEFAULT_RESOURCE_LIST_SORT, "age");
    expect(a).toEqual({ sort: "age", dir: "asc" });
    const b = nextSort(a, "age");
    expect(b).toEqual({ sort: "age", dir: "desc" });
    expect(nextSort(b, "age")).toEqual(DEFAULT_RESOURCE_LIST_SORT);
    expect(nextSort(b, "provider")).toEqual({ sort: "provider", dir: "asc" });
  });
  it("默认顺序不往 URL 上写", () => {
    expect(sortParams(DEFAULT_RESOURCE_LIST_SORT)).toEqual({});
    expect(sortParams({ sort: "item", dir: "desc" })).toEqual({ sort: "item", dir: "desc" });
  });
});

describe("sortResourceRows", () => {
  it("没排序时原样返回（库里的「新挂的在上」）", () => {
    const xs = [row("b"), row("a")];
    expect(by(DEFAULT_RESOURCE_LIST_SORT, xs)).toEqual(["b", "a"]);
  });

  it("年龄升序 = 年轻的在前 = 生日晚的在前；生日那列反过来", () => {
    const xs = [row("老", { dob: "1997-03-19" }), row("小", { dob: "2003-10-03" }), row("中", { dob: "2000-04-16" })];
    expect(by({ sort: "age", dir: "asc" }, xs)).toEqual(["小", "中", "老"]);
    expect(by({ sort: "age", dir: "desc" }, xs)).toEqual(["老", "中", "小"]);
    expect(by({ sort: "dob", dir: "asc" }, xs)).toEqual(["老", "中", "小"]);
  });

  it("空值不管升降都沉底", () => {
    const xs = [row("没填", { dob: null }), row("有", { dob: "2000-01-01" }), row("也有", { dob: "1990-01-01" })];
    expect(by({ sort: "dob", dir: "asc" }, xs).at(-1)).toBe("没填");
    expect(by({ sort: "dob", dir: "desc" }, xs).at(-1)).toBe("没填");
    const ys = [row("x", { holderName: null }), row("y")];
    expect(by({ sort: "holder", dir: "desc" }, ys)).toEqual(["y", "x"]);
  });

  it("排期按单数排，数字不按字符串比（10 > 9）", () => {
    const xs = [row("九", { bookingCount: 9 }), row("十", { bookingCount: 10 }), row("零", { bookingCount: 0 })];
    expect(by({ sort: "booked", dir: "desc" }, xs)).toEqual(["十", "九", "零"]);
  });

  it("有效期：不设下限的最早", () => {
    const xs = [row("晚", { validFrom: "2026-11-01" }), row("不限", { validFrom: null }), row("早", { validFrom: "2025-11-01" })];
    expect(by({ sort: "validity", dir: "asc" }, xs)).toEqual(["不限", "早", "晚"]);
  });

  it("状态按标签的先后：出租中 → 已过期 → 暂停 → 已下架 → 已删除", () => {
    const xs = [row("删", { badge: "deleted" }), row("租", { badge: "active" }), row("停", { badge: "paused" })];
    expect(by({ sort: "status", dir: "asc" }, xs)).toEqual(["租", "停", "删"]);
  });

  it("比不出先后的保持原来的顺序", () => {
    const xs = [row("一"), row("二"), row("三")];
    expect(by({ sort: "item", dir: "desc" }, xs)).toEqual(["一", "二", "三"]);
  });

  it("名字不分大小写", () => {
    const xs = [row("b", { holderName: "bob" }), row("A", { holderName: "Alice" })];
    expect(by({ sort: "holder", dir: "asc" }, xs)).toEqual(["A", "b"]);
  });
});

describe("地址 / 谁的联系人", () => {
  it("地址按 国家 → 州 → 城市 排，同一个州的挨着；没填的沉底", () => {
    const xs = [
      row("温哥华", { address: { country: "CA", region: "BC", city: "Vancouver" } }),
      row("没填", { address: null }),
      row("卡尔加里", { address: { country: "CA", region: "AB", city: "Calgary" } }),
      row("本拿比", { address: { country: "CA", region: "BC", city: "Burnaby" } }),
    ];
    expect(by({ sort: "address", dir: "asc" }, xs)).toEqual(["卡尔加里", "本拿比", "温哥华", "没填"]);
  });
  it("谁的联系人按名字排，没标的沉底", () => {
    const xs = [row("m", { contactNames: ["admin2"] }), row("无", { contactNames: [] }), row("l", { contactNames: ["Admin1"] })];
    expect(by({ sort: "contact", dir: "asc" }, xs)).toEqual(["l", "m", "无"]);
  });
});

