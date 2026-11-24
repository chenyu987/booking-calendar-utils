import { describe, it, expect } from "vitest";
import {
  dateRangeToArray,
  contiguousRuns,
  formatDayRanges,
  isWeekend,
  parseDaysInput,
  replaceDayRun,
  resizeIndices,
  daysBetween,
  shiftDays,
} from "./dates";

describe("dateRangeToArray", () => {
  it("展开成逐天数组，含首尾", () => {
    expect(dateRangeToArray("2026-09-10", "2026-09-12")).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("单天区间只有一天", () => {
    expect(dateRangeToArray("2026-09-10", "2026-09-10")).toEqual(["2026-09-10"]);
  });

  it("跨月也能正确展开", () => {
    expect(dateRangeToArray("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("contiguousRuns", () => {
  it("连续日期切成一段", () => {
    expect(contiguousRuns(["2026-09-10", "2026-09-11", "2026-09-12"])).toEqual([
      ["2026-09-10", "2026-09-11", "2026-09-12"],
    ]);
  });

  it("不连续日期切成几段（只要 24、25、27）", () => {
    expect(contiguousRuns(["2026-12-24", "2026-12-25", "2026-12-27"])).toEqual([
      ["2026-12-24", "2026-12-25"],
      ["2026-12-27"],
    ]);
  });

  it("乱序输入也能先排序再切段", () => {
    expect(contiguousRuns(["2026-09-12", "2026-09-10", "2026-09-11"])).toEqual([
      ["2026-09-10", "2026-09-11", "2026-09-12"],
    ]);
  });

  it("空数组返回空", () => {
    expect(contiguousRuns([])).toEqual([]);
  });
});

describe("formatDayRanges", () => {
  it("连续段压成 9/10-12 —— 同一个月只写一次月份", () => {
    expect(formatDayRanges(["2026-09-10", "2026-09-11", "2026-09-12"])).toBe("9/10-12");
  });

  it("不连续段用顿号分开", () => {
    expect(formatDayRanges(["2026-12-24", "2026-12-25", "2026-12-27"])).toBe("12/24-25、12/27");
  });

  it("跨月就把月份写全 —— 那时候月份是真信息", () => {
    expect(formatDayRanges(["2026-11-30", "2026-12-01", "2026-12-02"])).toBe("11/30-12/2");
  });

  it("单天不带区间", () => {
    expect(formatDayRanges(["2026-09-09"])).toBe("9/9");
  });

  it("跨年也算跨月", () => {
    expect(formatDayRanges(["2026-12-31", "2027-01-01"])).toBe("12/31-1/1");
  });
});

describe("isWeekend", () => {
  it("周六周日算周末", () => {
    expect(isWeekend("2026-09-12")).toBe(true); // 周六
    expect(isWeekend("2026-09-13")).toBe(true); // 周日
  });

  it("周一到周五不算周末", () => {
    expect(isWeekend("2026-09-10")).toBe(false); // 周四
  });
});

describe("parseDaysInput", () => {
  it("逗号/中文逗号/空格都能分隔", () => {
    expect(parseDaysInput("2026-12-24, 2026-12-25，2026-12-27")).toEqual([
      "2026-12-24",
      "2026-12-25",
      "2026-12-27",
    ]);
  });

  it("过滤掉格式不对的项", () => {
    expect(parseDaysInput("2026-12-24, 不是日期, 2026-12-25")).toEqual([
      "2026-12-24",
      "2026-12-25",
    ]);
  });
});

describe("replaceDayRun", () => {
  it("替换掉被拖的那一段，其它不连续日期不受影响", () => {
    const existing = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-12-25"];
    const result = replaceDayRun(existing, "2026-09-10", "2026-09-12", "2026-09-09", "2026-09-11");
    expect(result).toEqual(["2026-09-09", "2026-09-10", "2026-09-11", "2026-12-25"]);
  });

  it("拖右边框延长一天", () => {
    const existing = ["2026-09-10", "2026-09-11"];
    const result = replaceDayRun(existing, "2026-09-10", "2026-09-11", "2026-09-10", "2026-09-12");
    expect(result).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("拖左边框缩短一天", () => {
    const existing = ["2026-09-10", "2026-09-11", "2026-09-12"];
    const result = replaceDayRun(existing, "2026-09-10", "2026-09-12", "2026-09-11", "2026-09-12");
    expect(result).toEqual(["2026-09-11", "2026-09-12"]);
  });
});

describe("resizeIndices", () => {
  it("拖左边框往前延伸一天：起点变小，终点不变", () => {
    const { newStartIdx, newEndIdx } = resizeIndices(3, 2, 10, "start", -1);
    expect(newStartIdx).toBe(2);
    expect(newEndIdx).toBe(4); // 3 + 2 - 1
  });

  it("拖右边框往后延伸一天：终点变大，起点不变", () => {
    const { newStartIdx, newEndIdx } = resizeIndices(3, 2, 10, "end", 1);
    expect(newStartIdx).toBe(3);
    expect(newEndIdx).toBe(5); // 3 + 2 - 1 + 1
  });

  it("起点不能拖过终点", () => {
    const { newStartIdx, newEndIdx } = resizeIndices(3, 2, 10, "start", 10);
    expect(newStartIdx).toBe(newEndIdx); // 最短 1 天
  });

  it("终点不能拖过时间轴右边界", () => {
    const { newEndIdx } = resizeIndices(8, 1, 10, "end", 5);
    expect(newEndIdx).toBe(9); // timelineLength - 1
  });

  it("起点不能拖到负数", () => {
    const { newStartIdx } = resizeIndices(1, 3, 10, "start", -10);
    expect(newStartIdx).toBe(0);
  });

  it("终点不能拖过起点", () => {
    const { newStartIdx, newEndIdx } = resizeIndices(3, 2, 10, "end", -10);
    expect(newEndIdx).toBe(newStartIdx); // 最短 1 天
  });
});

describe("daysBetween", () => {
  it("同一天是 0，往后是正、往前是负", () => {
    expect(daysBetween("2026-12-03", "2026-12-03")).toBe(0);
    expect(daysBetween("2026-12-03", "2026-12-07")).toBe(4);
    expect(daysBetween("2026-12-07", "2026-12-03")).toBe(-4);
  });
  it("跨月、跨年、跨夏令时都按整天算", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2027-03-13", "2027-03-15")).toBe(2);
  });
});

describe("shiftDays", () => {
  it("整单平移，不连续的单挪完间隔不变", () => {
    expect(shiftDays(["2026-12-24", "2026-12-25", "2026-12-27"], 3)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-30",
    ]);
  });
  it("往前挪、跨月", () => {
    expect(shiftDays(["2027-01-01", "2027-01-02"], -2)).toEqual(["2026-12-30", "2026-12-31"]);
  });
  it("0 天原样", () => {
    expect(shiftDays(["2026-12-03"], 0)).toEqual(["2026-12-03"]);
  });
});
