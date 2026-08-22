import { describe, it, expect } from "vitest";
import {
  clampNavWidth,
  parseNavWidth,
  DEFAULT_NAV_WIDTH,
  MAX_NAV_WIDTH,
} from "./navWidth";

describe("clampNavWidth", () => {
  it("正常值原样返回", () => {
    expect(clampNavWidth(200)).toBe(200);
  });

  it("拖到负数按 0 算（完全收起）", () => {
    expect(clampNavWidth(-80)).toBe(0);
  });

  it("拖过头按上限算", () => {
    expect(clampNavWidth(9999)).toBe(MAX_NAV_WIDTH);
  });

  it("小数取整，避免宽度出现亚像素", () => {
    expect(clampNavWidth(160.6)).toBe(161);
  });
});

describe("parseNavWidth", () => {
  it("读得出数字就用它", () => {
    expect(parseNavWidth("240")).toBe(240);
  });

  it("0 是合法值——完全收起，不能当空值退回默认", () => {
    expect(parseNavWidth("0")).toBe(0);
  });

  it("没有 cookie 时用默认宽度", () => {
    expect(parseNavWidth(undefined)).toBe(DEFAULT_NAV_WIDTH);
    expect(parseNavWidth(null)).toBe(DEFAULT_NAV_WIDTH);
    expect(parseNavWidth("")).toBe(DEFAULT_NAV_WIDTH);
  });

  it("cookie 是用户可改的，脏值退回默认", () => {
    expect(parseNavWidth("abc")).toBe(DEFAULT_NAV_WIDTH);
    expect(parseNavWidth("NaN")).toBe(DEFAULT_NAV_WIDTH);
  });

  it("超范围的脏值也要夹回来", () => {
    expect(parseNavWidth("99999")).toBe(MAX_NAV_WIDTH);
    expect(parseNavWidth("-50")).toBe(0);
  });
});
