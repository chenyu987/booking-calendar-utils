import { describe, it, expect } from "vitest";
import { itemKind, itemColumns, parseItemKinds, ITEM_KINDS } from "./itemKind";

describe("itemKind", () => {
  it("beta 按分档拆三种，空着的是 unknown", () => {
    expect(itemKind({ item_type: "beta", item_tier: "base" })).toBe("beta-base");
    expect(itemKind({ item_type: "beta", item_tier: "full" })).toBe("beta-full");
    expect(itemKind({ item_type: "beta", item_tier: null })).toBe("beta-unknown");
    expect(itemKind({ item_type: "beta" })).toBe("beta-unknown");
  });
  it("alpha 就是 alpha；类型没填的是 null", () => {
    expect(itemKind({ item_type: "alpha", item_tier: null })).toBe("alpha");
    expect(itemKind({ item_type: null })).toBeNull();
  });
});

describe("itemColumns", () => {
  it("每一种都能来回一趟", () => {
    for (const k of ITEM_KINDS) expect(itemKind(itemColumns(k)!)).toBe(k);
  });
  it("alpha 不带档", () => {
    expect(itemColumns("alpha")).toEqual({ item_type: "alpha", item_tier: null });
  });
  it("老表单的 beta = 还不知道哪档；认不出来的拒掉", () => {
    expect(itemColumns("beta")).toEqual({ item_type: "beta", item_tier: null });
    expect(itemColumns("beta-gold")).toBeNull();
    expect(itemColumns("")).toBeNull();
  });
});

describe("parseItemKinds", () => {
  it("逗号隔开，按固定顺序，去重", () => {
    expect(parseItemKinds("beta-full,alpha,alpha")).toEqual(["alpha", "beta-full"]);
  });
  it("同名参数重复几次也认", () => {
    expect(parseItemKinds(["beta-base", "alpha"])).toEqual(["alpha", "beta-base"]);
  });
  it("老链接的 beta 展开成三档；认不出来的丢掉", () => {
    expect(parseItemKinds("beta")).toEqual(["beta-base", "beta-full", "beta-unknown"]);
    expect(parseItemKinds("月资源,alpha")).toEqual(["alpha"]);
    expect(parseItemKinds(undefined)).toEqual([]);
  });
});
