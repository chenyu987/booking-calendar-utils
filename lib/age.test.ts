import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calcAge, formatHolder } from "./age";

// 用本地时间构造"今天"，避免测试机时区跟 UTC 差一天时闰到边界上
const TODAY = new Date(2026, 8, 15, 12); // 2026-09-15 中午（本地时区）

describe("calcAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("生日已经过去很久算今年满岁", () => {
    expect(calcAge("1995-06-10")).toBe(31);
  });

  it("生日还没到（离今天够远，不受时区影响）算虚岁减一", () => {
    expect(calcAge("1995-12-10")).toBe(30);
  });

  it("没填生日返回 null", () => {
    expect(calcAge(null)).toBeNull();
    expect(calcAge(undefined)).toBeNull();
  });

  it("格式不对的日期返回 null", () => {
    expect(calcAge("不是日期")).toBeNull();
  });
});

describe("formatHolder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("男 + 年龄", () => {
    expect(formatHolder("male", "1995-06-10")).toBe("男 31岁");
  });

  it("没有性别没有生日显示占位符", () => {
    expect(formatHolder(null, null)).toBe("-");
  });
});
