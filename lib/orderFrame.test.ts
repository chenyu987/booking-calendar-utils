import { describe, it, expect } from "vitest";
import { BETA_FRAME_COLOR, adminColor, adminTagColors, effectiveAdminId, frameColor, frameInnerColor, orderFrame } from "./orderFrame";
import { TOKENS } from "./theme";

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

describe("「谁的客人」标签的颜色（Provider 管理）", () => {
  it("**跟边框同一套排位**：Admin1 是 1 号色（浅玫红），小王 2 号", () => {
    expect(adminTagColors("admin1", ADMINS, "admin2")).toEqual({
      background: "var(--admin-1-tint)",
      color: "var(--admin-1-ink)",
    });
    expect(adminTagColors("wang", ADMINS, "admin2")?.background).toBe("var(--admin-2-tint)");
  });

  it("主要管理员、名单里没有的 → null（标签保持原样）", () => {
    expect(adminTagColors("admin2", ADMINS, "admin2")).toBeNull();
    expect(adminTagColors("gone", ADMINS, "admin2")).toBeNull();
  });

  it("用到的 token 在 lib/theme.ts 里都有（不然暗色、亮色下都是空的）", () => {
    for (let slot = 1; slot <= 4; slot++) {
      expect(TOKENS).toHaveProperty(`admin-${slot}-tint`);
      expect(TOKENS).toHaveProperty(`admin-${slot}-ink`);
    }
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

  it("别人的单：只把边框换成他的颜色，不再叠一层（太扎眼）", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: "var(--admin-1)", assigning: false })).toEqual({
      border: "1px solid var(--admin-1)",
      boxShadow: undefined,
    });
  });

  it("**选中时管理员颜色加重**，外面照样有选中的蓝光", () => {
    expect(orderFrame({ statusBorder: STATUS, adminColor: "var(--admin-1)", assigning: true })).toEqual({
      border: "1px solid var(--admin-1)",
      boxShadow: "inset 0 0 0 1px var(--admin-1), 0 0 0 1px var(--link)",
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
    ).toBe("0 0 0 2px var(--prev-use)");
  });
});

describe("Beta 的单边框一个颜色", () => {
  it("Beta 地点的单边框不管是谁的都是 Beta 色，压过管理员的颜色（是谁的看里面那一圈）", () => {
    expect(frameColor("locbp", "admin1", ADMINS, "admin2")).toBe(BETA_FRAME_COLOR);
    expect(frameColor("Loccw", "admin2", ADMINS, "admin2")).toBe(BETA_FRAME_COLOR);
    expect(frameColor("locdm", null, ADMINS, null)).toBe(BETA_FRAME_COLOR);
  });

  it("Alpha 的地点、认不出来的地点照旧按管理员", () => {
    expect(frameColor("locaa", "admin1", ADMINS, "admin2")).toBe("var(--admin-1)");
    expect(frameColor("locaa", "admin2", ADMINS, "admin2")).toBeNull();
    expect(frameColor("111", "admin1", ADMINS, "admin2")).toBe("var(--admin-1)");
    expect(frameColor("brighton", "admin2", ADMINS, "admin2")).toBeNull();
  });
});

describe("Beta 的单也分得出是谁的（2026-11-11）", () => {
  const STATUS = "var(--st-assigned-border)";

  it("非主要管理员的 Beta 单：里面那一圈是他的颜色", () => {
    expect(frameInnerColor("locbp", "admin1", ADMINS, "admin2")).toBe("var(--admin-1)");
  });

  it("主要管理员的 Beta、Alpha 的单、认不出来的地点、算不出是谁的 → 没有那一圈", () => {
    expect(frameInnerColor("locbp", "admin2", ADMINS, "admin2")).toBeNull();
    expect(frameInnerColor("locaa", "admin1", ADMINS, "admin2")).toBeNull();
    expect(frameInnerColor("111", "admin1", ADMINS, "admin2")).toBeNull();
    expect(frameInnerColor("locbp", null, ADMINS, "admin2")).toBeNull();
  });

  it("Admin1 的 Beta 单：青边 + 里一圈玫红；跟 admin2 的 Beta 单（只有青边）长得不一样", () => {
    const admin1 = orderFrame({
      statusBorder: STATUS,
      adminColor: BETA_FRAME_COLOR,
      innerColor: "var(--admin-1)",
      assigning: false,
    });
    const admin2 = orderFrame({ statusBorder: STATUS, adminColor: BETA_FRAME_COLOR, assigning: false });
    expect(admin1).toEqual({ border: `1px solid ${BETA_FRAME_COLOR}`, boxShadow: "inset 0 0 0 1px var(--admin-1)" });
    expect(admin2).toEqual({ border: `1px solid ${BETA_FRAME_COLOR}`, boxShadow: undefined });
  });

  it("选中时青色往里加重一层，他的颜色再往里挪一层，外面照旧蓝光；边框永远 1px", () => {
    expect(
      orderFrame({ statusBorder: STATUS, adminColor: BETA_FRAME_COLOR, innerColor: "var(--admin-1)", assigning: true })
    ).toEqual({
      border: `1px solid ${BETA_FRAME_COLOR}`,
      boxShadow: `inset 0 0 0 1px ${BETA_FRAME_COLOR}, inset 0 0 0 2px var(--admin-1), 0 0 0 1px var(--link)`,
    });
  });

  it("「上一单」的琥珀光照旧，那一圈也还在", () => {
    expect(
      orderFrame({
        statusBorder: STATUS,
        adminColor: BETA_FRAME_COLOR,
        innerColor: "var(--admin-1)",
        assigning: false,
        previousUse: true,
      }).boxShadow
    ).toBe("inset 0 0 0 1px var(--admin-1), 0 0 0 2px var(--prev-use)");
  });
});
