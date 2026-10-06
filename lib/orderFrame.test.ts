import { describe, it, expect } from "vitest";
import { adminColor, effectiveAdminId, orderFrame } from "./orderFrame";

const ADMINS = [
  { id: "admin1", name: "Admin1" },
  { id: "admin2", name: "admin2" },
  { id: "wang", name: "小王" },
];

describe("这一单算谁的", () => {
  it("写了就是写的那个", () => {
    expect(effectiveAdminId("admin1", "admin2")).toBe("admin1");
  });

  it("**没写就算主要管理员的** —— 以前的单不补，现算", () => {
    expect(effectiveAdminId(null, "admin2")).toBe("admin2");
    expect(effectiveAdminId(undefined, "admin2")).toBe("admin2");
  });

  it("主要管理员也没设：算不出来", () => {
    expect(effectiveAdminId(null, null)).toBeNull();
  });
});

describe("管理员的边框颜色", () => {
  it("**主要管理员不上色**，算不出是谁的也不上色", () => {
    expect(adminColor("admin2", ADMINS, "admin2")).toBeNull();
    expect(adminColor(null, ADMINS, "admin2")).toBeNull();
  });

  it("其余按加入的先后取，主要管理员不占位", () => {
    // admin2 是主要的、排在中间，不该把小王挤到第 3 个颜色
    expect(adminColor("admin1", ADMINS, "admin2")).toBe("var(--admin-1)");
    expect(adminColor("wang", ADMINS, "admin2")).toBe("var(--admin-2)");
  });

  it("名单里没有的 id 不上色（被删了、手工改坏了）", () => {
    expect(adminColor("gone", ADMINS, "admin2")).toBeNull();
  });

  it("人多过颜色数就轮着用", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: `a${i}` }));
    expect(adminColor("a4", many, null)).toBe("var(--admin-1)");
  });
});

describe("色块的边框和光圈", () => {
  const STATUS = "var(--st-assigned-border)";

  it("**边框永远是 1px** —— 粗细一变，进出选中所有字都跳一下", () => {
    for (const adminColor of [null, "var(--admin-1)"]) {
      for (const assigning of [false, true]) {
        for (const previousUse of [false, true]) {
          expect(orderFrame({ statusBorder: STATUS, adminColor, assigning, previousUse }).border).toMatch(
            /^1px solid /
          );
        }
      }
    }
  });

  it("主要管理员的单：跟以前一模一样（状态色细边，没有阴影）", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: null, assigning: false })).toEqual({
      border: `1px solid ${STATUS}`,
      boxShadow: undefined,
    });
  });

  it("别人的单：边框换成他的颜色，里面再叠一层同色", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: "var(--admin-1)", assigning: false })).toEqual({
      border: "1px solid var(--admin-1)",
      boxShadow: "inset 0 0 0 1px var(--admin-1)",
    });
  });

  it("**选中时管理员颜色加重**，外面照样有选中的蓝光", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: "var(--admin-1)", assigning: true })).toEqual({
      border: "1px solid var(--admin-1)",
      boxShadow: "inset 0 0 0 2px var(--admin-1), 0 0 0 1px var(--link)",
    });
  });

  it("主要管理员的单选中：跟以前一样是蓝边蓝光", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: null, assigning: true })).toEqual({
      border: "1px solid var(--link)",
      boxShadow: "0 0 0 1px var(--link)",
    });
  });

  it("「上一单在这儿」的琥珀光不受管理员颜色影响", () => {
    expect(
      orderFrame({ statusBorder: STATUS, adminColor: "var(--admin-1)", assigning: false, previousUse: true })
        .boxShadow
    ).toBe("inset 0 0 0 1px var(--admin-1), 0 0 0 2px var(--prev-use)");
  });
});
