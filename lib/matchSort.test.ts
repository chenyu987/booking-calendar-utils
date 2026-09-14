import { describe, it, expect } from "vitest";
import { parseMatchSort, sortMatches, firstDay } from "./matchSort";

const row = (id: string, days: string[] | null, created = "2026-01-01") => ({
  id,
  created_at: created,
  orders: days === null ? null : { demand_days: days },
});

describe("parseMatchSort", () => {
  it("认识的就用，不认识的回默认（按日期近→远）", () => {
    expect(parseMatchSort("dateDesc")).toBe("dateDesc");
    expect(parseMatchSort("created")).toBe("created");
    expect(parseMatchSort("乱填")).toBe("date");
    expect(parseMatchSort(undefined)).toBe("date");
  });
});

describe("firstDay", () => {
  it("拿最早那天，不管数组里怎么排的", () => {
    expect(firstDay(row("a", ["2026-09-20", "2026-09-11"]))).toBe("2026-09-11");
  });

  it("没有日期就是空串", () => {
    expect(firstDay(row("a", []))).toBe("");
    expect(firstDay(row("a", null))).toBe("");
  });
});

describe("sortMatches", () => {
  const rows = [
    row("late", ["2026-12-01"]),
    row("early", ["2026-09-11", "2026-09-12"]),
    row("mid", ["2026-10-05"]),
  ];

  it("默认近 → 远", () => {
    expect(sortMatches(rows, "date").map((r) => r.id)).toEqual(["early", "mid", "late"]);
  });

  it("倒过来", () => {
    expect(sortMatches(rows, "dateDesc").map((r) => r.id)).toEqual(["late", "mid", "early"]);
  });

  it("按提交时间是最近的在前", () => {
    const byTime = [
      row("old", ["2026-09-11"], "2026-01-01"),
      row("new", ["2026-12-01"], "2026-06-01"),
    ];
    expect(sortMatches(byTime, "created").map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("没填日期的一律沉底 —— 正序倒序都一样", () => {
    const withBlank = [...rows, row("blank", [])];
    expect(sortMatches(withBlank, "date").map((r) => r.id).at(-1)).toBe("blank");
    expect(sortMatches(withBlank, "dateDesc").map((r) => r.id).at(-1)).toBe("blank");
  });

  it("不改原数组", () => {
    const input = [...rows];
    sortMatches(input, "dateDesc");
    expect(input.map((r) => r.id)).toEqual(["late", "early", "mid"]);
  });
});
