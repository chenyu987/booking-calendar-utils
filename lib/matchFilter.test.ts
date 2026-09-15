import { describe, it, expect } from "vitest";
import {
  parseMatchFilters,
  hasAnyMatchFilter,
  matchesMatchFilters,
  EMPTY_MATCH_FILTERS,
  type FilterableMatch,
  type MatchFilters,
} from "./matchFilter";

const row: FilterableMatch = {
  matchStatus: "proposed",
  orderStatus: "created",
  location: "locaa",
  customerName: "小明",
  providerName: "admin1",
  holderName: "david chang",
  days: ["2026-09-10", "2026-09-11", "2026-09-12"],
  isComplete: false,
  stale: false,
};
const f = (over: Partial<MatchFilters> = {}): MatchFilters => ({
  ...EMPTY_MATCH_FILTERS,
  ...over,
});

describe("parseMatchFilters", () => {
  it("认不出来的值一律当没筛，不报错", () => {
    const got = parseMatchFilters({ mstatus: "乱填", gap: "乱填", customer: " 小明 " });
    expect(got.mstatus).toBe("");
    expect(got.gap).toBe("");
    expect(got.customer).toBe("小明");
  });

  it("没有任何参数就是没筛", () => {
    expect(hasAnyMatchFilter(parseMatchFilters({}))).toBe(false);
  });
});

describe("matchesMatchFilters", () => {
  it("没筛就全留", () => {
    expect(matchesMatchFilters(row, f())).toBe(true);
  });

  it("「还没结的」不含已经落空的 —— 那一单都开始了，它挂在这儿只是没人清", () => {
    expect(matchesMatchFilters({ ...row, stale: true }, f({ mstatus: "open" }))).toBe(false);
    expect(matchesMatchFilters({ ...row, stale: true }, f({ mstatus: "stale" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ mstatus: "stale" }))).toBe(false);
  });

  it("落空只对还没结的成立 —— chosen 不会被算成「过期没选上」", () => {
    const done = { ...row, matchStatus: "chosen", stale: true };
    expect(matchesMatchFilters(done, f({ mstatus: "stale" }))).toBe(false);
  });

  it("意向状态：open 是 proposed + allowed 的合成档", () => {
    expect(matchesMatchFilters(row, f({ mstatus: "open" }))).toBe(true);
    expect(matchesMatchFilters({ ...row, matchStatus: "allowed" }, f({ mstatus: "open" }))).toBe(
      true
    );
    expect(matchesMatchFilters({ ...row, matchStatus: "chosen" }, f({ mstatus: "open" }))).toBe(
      false
    );
  });

  it("意向状态：挑具体一档", () => {
    expect(matchesMatchFilters(row, f({ mstatus: "chosen" }))).toBe(false);
    expect(matchesMatchFilters(row, f({ mstatus: "proposed" }))).toBe(true);
  });

  it("订单状态", () => {
    expect(matchesMatchFilters(row, f({ ostatus: "complete" }))).toBe(false);
    expect(matchesMatchFilters(row, f({ ostatus: "created" }))).toBe(true);
  });

  it("地点 / 区域走共用那一份判断", () => {
    expect(matchesMatchFilters(row, f({ mtn: "locaa" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ mtn: "locaj" }))).toBe(false);
  });

  it("客户按包含匹配，不分大小写", () => {
    expect(matchesMatchFilters({ ...row, customerName: "Laura" }, f({ customer: "lau" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ customer: "小红" }))).toBe(false);
  });

  it("一个框同时搜物主和持有人 —— 任一命中就算", () => {
    expect(matchesMatchFilters(row, f({ resource: "admin1" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ resource: "david" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ resource: "sara" }))).toBe(false);
  });

  // 日期筛的是有没有交集，不是整段落进区间 —— 跟 Resource 那边正好相反，是有意的
  it("日期：有交集就算，不要求整段落进去", () => {
    expect(matchesMatchFilters(row, f({ from: "2026-09-12", to: "2026-09-20" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ from: "2026-09-13" }))).toBe(false);
    expect(matchesMatchFilters(row, f({ to: "2026-09-09" }))).toBe(false);
  });

  it("没填日期的，一旦按日期筛就落不进去", () => {
    expect(matchesMatchFilters({ ...row, days: [] }, f({ from: "2026-09-01" }))).toBe(false);
    expect(matchesMatchFilters({ ...row, days: [] }, f())).toBe(true);
  });

  it("分配进度：只看还缺资源的 / 只看已经配齐的", () => {
    expect(matchesMatchFilters(row, f({ gap: "gap" }))).toBe(true);
    expect(matchesMatchFilters(row, f({ gap: "full" }))).toBe(false);
    const done = { ...row, isComplete: true };
    expect(matchesMatchFilters(done, f({ gap: "full" }))).toBe(true);
    expect(matchesMatchFilters(done, f({ gap: "gap" }))).toBe(false);
  });

  it("算不出分配进度的（订单都没了），按进度筛时两边都落不进去", () => {
    const orphan = { ...row, isComplete: null };
    expect(matchesMatchFilters(orphan, f({ gap: "gap" }))).toBe(false);
    expect(matchesMatchFilters(orphan, f({ gap: "full" }))).toBe(false);
    expect(matchesMatchFilters(orphan, f())).toBe(true);
  });

  it("多个条件是「而且」不是「或者」", () => {
    expect(matchesMatchFilters(row, f({ mtn: "locaa", customer: "小红" }))).toBe(false);
  });
});
