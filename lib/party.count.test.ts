import { describe, it, expect } from "vitest";
import { parseCount } from "./party";

describe("parseCount", () => {
  it("空着算 0 —— 框里没填就是没人", () => {
    expect(parseCount("")).toBe(0);
    expect(parseCount("   ")).toBe(0);
    expect(parseCount(null)).toBe(0);
    expect(parseCount(undefined)).toBe(0);
  });

  it("正常的数字", () => {
    expect(parseCount("1")).toBe(1);
    expect(parseCount("3")).toBe(3);
    expect(parseCount(" 2 ")).toBe(2);
  });

  it("「01」这种前导零按 1 算 —— 就是这个写法把界面坑了", () => {
    expect(parseCount("01")).toBe(1);
    expect(parseCount("007")).toBe(7);
  });

  it("负数和垃圾字符落到 0，不能让 NaN 或 -1 变成要几个资源", () => {
    expect(parseCount("-1")).toBe(0);
    expect(parseCount("abc")).toBe(0);
    expect(parseCount("1e")).toBe(0);
  });

  it("小数往下取整 —— 半个人配不了资源", () => {
    expect(parseCount("2.9")).toBe(2);
    expect(parseCount("0.5")).toBe(0);
  });
});
