import { describe, expect, it } from "vitest";
import {
  orderInItemMode,
  parseItemMode,
  itemModeLocationBlock,
  resourceInItemMode,
} from "./itemMode";

describe("parseItemMode", () => {
  it("只认 alpha / beta，别的都当全部", () => {
    expect(parseItemMode("alpha")).toBe("alpha");
    expect(parseItemMode("beta")).toBe("beta");
    expect(parseItemMode("ALPHA")).toBe("");
    expect(parseItemMode(undefined)).toBe("");
    expect(parseItemMode("xx")).toBe("");
  });
});

describe("orderInItemMode", () => {
  it("全部 = 都显示", () => {
    expect(orderInItemMode("locaa", "")).toBe(true);
    expect(orderInItemMode("locbp", "")).toBe(true);
  });

  it("按地点收哪种资源分", () => {
    expect(orderInItemMode("locaa", "alpha")).toBe(true);
    expect(orderInItemMode("locaa", "beta")).toBe(false);
    expect(orderInItemMode("Loccw", "beta")).toBe(true);
    expect(orderInItemMode("Loccw", "alpha")).toBe(false);
  });

  it("判断不了的两边都显示（没填、写错、重名）", () => {
    for (const m of [null, "", "111", "brighton"]) {
      expect(orderInItemMode(m, "alpha")).toBe(true);
      expect(orderInItemMode(m, "beta")).toBe(true);
    }
  });
});

describe("resourceInItemMode", () => {
  it("按类型分，类型没填的两边都显示", () => {
    expect(resourceInItemMode("alpha", "alpha")).toBe(true);
    expect(resourceInItemMode("beta", "alpha")).toBe(false);
    expect(resourceInItemMode("beta", "beta")).toBe(true);
    expect(resourceInItemMode(null, "beta")).toBe(true);
    expect(resourceInItemMode("beta", "")).toBe(true);
  });
});

describe("itemModeLocationBlock", () => {
  it("填了另一边的地点 → 说清楚", () => {
    const msg = itemModeLocationBlock("locbp", "alpha");
    expect(msg).toContain("locbp");
    expect(msg).toContain("Beta");
  });

  it("对得上、判断不了、开关在全部 → 不拦", () => {
    expect(itemModeLocationBlock("locaa", "alpha")).toBeNull();
    expect(itemModeLocationBlock("", "alpha")).toBeNull();
    expect(itemModeLocationBlock("111", "beta")).toBeNull();
    expect(itemModeLocationBlock("locbp", "")).toBeNull();
  });
});
