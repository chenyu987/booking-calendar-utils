import { describe, expect, it } from "vitest";
import { bookingYear, formatRun, sortChronologically, summarizeBookings, toBookingRuns } from "./booking";

const TODAY = "2026-09-10";

describe("bookingYear", () => {
  it("同一年就写那一年，日子乱序也一样", () => {
    expect(bookingYear(["2025-12-01", "2025-11-29", "2025-11-30"])).toBe("25");
  });
  it("跨年的单两头都写，不挑一头猜", () => {
    expect(bookingYear(["2026-01-02", "2025-12-30"])).toBe("25-26");
  });
  it("没日子给空串", () => {
    expect(bookingYear([])).toBe("");
    expect(bookingYear(null)).toBe("");
  });
});

describe("toBookingRuns", () => {
  it("每段都带上那一单去的地点", () => {
    const runs = toBookingRuns(
      [{ days: ["2026-09-12", "2026-09-13"], location: "locbn" }],
      TODAY
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].label).toBe("9/12-13");
    expect(runs[0].location).toBe("locbn");
  });

  it("同一单里不连续的日子各算一段，地点跟着走", () => {
    const runs = toBookingRuns(
      [{ days: ["2026-09-24", "2026-09-25", "2026-09-27"], location: "locbl" }],
      TODAY
    );
    expect(runs.map((r) => r.label)).toEqual(["9/24-25", "9/27"]);
    expect(runs.every((r) => r.location === "locbl")).toBe(true);
  });

  it("不同订单不会被并到一起 —— 并了就看不出哪几天去哪", () => {
    const runs = toBookingRuns(
      [
        { days: ["2026-09-12"], location: "locbn" },
        { days: ["2026-09-13"], location: "locbl" },
      ],
      TODAY
    );
    // 日期挨着，但分属两单两个地点，必须分开显示
    expect(runs.map((r) => [r.label, r.location])).toEqual([
      ["9/12", "locbn"],
      ["9/13", "locbl"],
    ]);
  });

  it("地点名空白当没填", () => {
    expect(toBookingRuns([{ days: ["2026-09-12"], location: "   " }], TODAY)[0].location).toBeNull();
    expect(toBookingRuns([{ days: ["2026-09-12"], location: null }], TODAY)[0].location).toBeNull();
  });

  it("结束日期在今天之前的算过去", () => {
    const runs = toBookingRuns(
      [
        { days: ["2026-09-01"], location: "locaa" },
        { days: ["2026-09-10"], location: "locaa" }, // 就是今天，不算过去
        { days: ["2026-09-20"], location: "locaa" },
      ],
      TODAY
    );
    expect(runs.map((r) => r.past)).toEqual([true, false, false]);
  });
});

describe("sortChronologically（正序，最近的靠右）", () => {
  it("按时间正序 —— 时间轴该往哪走就往哪走", () => {
    const runs = toBookingRuns(
      [
        { days: ["2026-09-20"], location: "最晚" },
        { days: ["2026-09-10", "2026-09-11"], location: "最早" },
        { days: ["2026-09-15"], location: "中间" },
      ],
      TODAY
    );
    expect(sortChronologically(runs).map((r) => r.location)).toEqual([
      "最早",
      "中间",
      "最晚",
    ]);
  });

  it("过去的和未来的一起排，不分两堆", () => {
    const runs = toBookingRuns(
      [
        { days: ["2026-09-20"], location: "下周" },
        { days: ["2026-08-01"], location: "上个月" },
        { days: ["2026-09-09"], location: "昨天" },
      ],
      TODAY
    );
    expect(sortChronologically(runs).map((r) => r.location)).toEqual([
      "上个月",
      "昨天",
      "下周",
    ]);
  });

  it("开始日期一样时短的排前面", () => {
    const runs = toBookingRuns(
      [
        { days: ["2026-09-10", "2026-09-11", "2026-09-12"], location: "长" },
        { days: ["2026-09-10"], location: "短" },
      ],
      TODAY
    );
    expect(sortChronologically(runs).map((r) => r.location)).toEqual(["短", "长"]);
  });

  it("不改原数组", () => {
    const runs = toBookingRuns(
      [{ days: ["2026-09-20"], location: "b" }, { days: ["2026-09-01"], location: "a" }],
      TODAY
    );
    const before = runs.map((r) => r.location);
    sortChronologically(runs);
    expect(runs.map((r) => r.location)).toEqual(before);
  });
});

describe("formatRun", () => {
  it("有地点就带上，没地点就说没填", () => {
    const [withM] = toBookingRuns([{ days: ["2026-09-12"], location: "locaj" }], TODAY);
    const [without] = toBookingRuns([{ days: ["2026-09-12"], location: null }], TODAY);
    expect(formatRun(withM)).toBe("9/12 locaj");
    expect(formatRun(without)).toContain("没填");
  });
});

describe("summarizeBookings", () => {
  const o = (id: string, days: string[]) => ({ id, demand_days: days });

  it("按活动日期排，不按传进来的顺序 —— 补录的历史单排在前面", () => {
    const r = summarizeBookings([
      o("new", ["2026-10-04"]),
      o("backfill", ["2026-09-03"]),
      o("mid", ["2026-09-15"]),
    ]);
    expect(r.first?.id).toBe("backfill");
    expect(r.last?.id).toBe("new");
    expect(r.list.map((x) => x.id)).toEqual(["backfill", "mid", "new"]);
  });

  it("日子是乱序数组也按最早那天算", () => {
    const r = summarizeBookings([o("a", ["2026-09-20", "2026-09-08"]), o("b", ["2026-09-10"])]);
    expect(r.first?.id).toBe("a");
  });

  it("三单及以上中间省掉了，用「…」", () => {
    expect(summarizeBookings([o("a", ["2026-09-01"]), o("b", ["2026-09-02"]), o("c", ["2026-09-03"])]).joiner).toBe("…");
  });

  it("两单中间什么都没省，用「、」", () => {
    const r = summarizeBookings([o("a", ["2026-09-01"]), o("b", ["2026-09-02"])]);
    expect(r.joiner).toBe("、");
    expect([r.first?.id, r.last?.id]).toEqual(["a", "b"]);
  });

  it("一单只有 first，没有 last 也没有连接符", () => {
    const r = summarizeBookings([o("a", ["2026-09-01"])]);
    expect(r.first?.id).toBe("a");
    expect(r.last).toBe(null);
    expect(r.joiner).toBe(null);
  });

  it("没排过就全是空的", () => {
    expect(summarizeBookings([])).toEqual({ list: [], first: null, last: null, joiner: null });
  });

  it("不改传进来的数组", () => {
    const input = [o("b", ["2026-09-02"]), o("a", ["2026-09-01"])];
    summarizeBookings(input);
    expect(input.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
