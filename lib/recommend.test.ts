import { describe, expect, it } from "vitest";
import {
  recommendResources,
  isRecommended,
  AGE_TOLERANCE,
  type Candidate,
  type PastUse,
} from "./recommend";

const card = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  itemType: "alpha",
  holderDateOfBirth: null,
  providerId: "provider-1",
  bookedDays: [],
  ...extra,
});

const base = {
  order: { customerId: "customer-A", location: "locag", demandDays: ["2026-01-10"] },
  customerAge: null as number | null,
  history: [] as PastUse[],
};

const scoreOf = (out: ReturnType<typeof recommendResources>, id: string) =>
  out.find((s) => s.resourceId === id)!;

describe("回头客复用", () => {
  it("这个客人用过的资源分数最高", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("used"), card("fresh")],
      history: [
        {
          resourceId: "used",
          customerId: "customer-A",
          location: "locag",
          status: "complete",
          days: ["2025-12-01"],
        },
      ],
    });
    expect(scoreOf(out, "used").score).toBeGreaterThan(scoreOf(out, "fresh").score);
    expect(scoreOf(out, "used").top).toBe(true);
    expect(scoreOf(out, "used").signals.map((s) => s.code)).toContain("repeat-customer");
  });

  it("别人用过的资源不算回头客", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("s1")],
      history: [
        {
          resourceId: "s1",
          customerId: "customer-B",
          location: "locag",
          status: "complete",
          days: [],
        },
      ],
    });
    expect(scoreOf(out, "s1").signals.map((s) => s.code)).not.toContain("repeat-customer");
  });

  it("那单被取消了的，只给一个弱信号", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("s1")],
      history: [
        { resourceId: "s1", customerId: "customer-A", location: null, status: "cancelled", days: [] },
      ],
    });
    const codes = scoreOf(out, "s1").signals.map((s) => s.code);
    expect(codes).toContain("repeat-customer-unsettled");
    expect(codes).not.toContain("repeat-customer");
  });
});

describe("地理惯性", () => {
  it("去过同一个地点 > 去过同一片 > 没去过", () => {
    const mk = (id: string, location: string | null): PastUse => ({
      resourceId: id,
      customerId: "customer-X",
      location,
      status: "complete",
      days: [],
    });
    const out = recommendResources({
      ...base,
      candidates: [card("same"), card("region"), card("far")],
      history: [mk("same", "locag"), mk("region", "locai"), mk("far", "local")],
    });
    expect(scoreOf(out, "same").score).toBeGreaterThan(scoreOf(out, "region").score);
    expect(scoreOf(out, "region").score).toBeGreaterThan(scoreOf(out, "far").score);
  });

  it("用户举的例子：9 号去 locag，上次去过 locai 的资源应该被推荐", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("regionB-card"), card("vermont-card")],
      history: [
        // 日期得在本单（2026-01-10）之前，不然按规则不算「之前那一次」
        {
          resourceId: "regionB-card",
          customerId: "someone",
          location: "locai",
          status: "complete",
          days: ["2025-12-20"],
        },
        {
          resourceId: "vermont-card",
          customerId: "someone",
          location: "locam",
          status: "complete",
          days: ["2025-12-20"],
        },
      ],
    });
    expect(scoreOf(out, "regionB-card").top).toBe(true);
    expect(scoreOf(out, "vermont-card").top).toBe(false);
  });
});

describe("item 对不对得上", () => {
  it("Beta 资源去 Alpha 的地点会被重罚，但不是拦截", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("beta-card", { itemType: "beta" })],
    });
    const s = scoreOf(out, "beta-card");
    expect(s.score).toBeLessThan(0);
    expect(s.signals.map((x) => x.code)).toContain("item-mismatch");
  });

  it("认不出的地点不给任何 item 判断", () => {
    const out = recommendResources({
      ...base,
      order: { ...base.order, location: "111" },
      candidates: [card("s1")],
    });
    const codes = scoreOf(out, "s1").signals.map((x) => x.code);
    expect(codes).not.toContain("item-fits");
    expect(codes).not.toContain("item-mismatch");
  });
});

describe("年龄", () => {
  it("没有客户年龄时，年龄完全不参与", () => {
    const out = recommendResources({
      ...base,
      customerAge: null,
      candidates: [card("s1", { holderDateOfBirth: "1990-01-01" })],
    });
    expect(scoreOf(out, "s1").signals.map((x) => x.code)).not.toContain("age");
  });

  it("有年龄时，接近的加分、差太多扣分", () => {
    const out = recommendResources({
      ...base,
      customerAge: 26,
      candidates: [
        card("close", { holderDateOfBirth: "1999-01-01" }),
        card("far", { holderDateOfBirth: "1975-01-01" }),
      ],
    });
    expect(scoreOf(out, "close").score).toBeGreaterThan(scoreOf(out, "far").score);
    expect(scoreOf(out, "far").signals.map((x) => x.code)).toContain("age-far");
  });
});

describe("运营便利", () => {
  it("跟已排日期连着的资源加分（不切碎档期）", () => {
    const out = recommendResources({
      ...base,
      candidates: [
        card("adjacent", { bookedDays: ["2026-01-09"] }),
        card("island", { bookedDays: ["2026-02-20"] }),
      ],
    });
    expect(scoreOf(out, "adjacent").score).toBeGreaterThan(scoreOf(out, "island").score);
  });

  it("跟已配的资源同一个物主，加分（取还跑一趟）", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("same-provider", { providerId: "o1" }), card("other", { providerId: "o2" })],
      assignedProviderIds: ["o1"],
    });
    expect(scoreOf(out, "same-provider").score).toBeGreaterThan(scoreOf(out, "other").score);
  });
});

describe("打星星（★ 推荐）的规则", () => {
  it("全都没什么信号时，一个都不推荐", () => {
    const out = recommendResources({
      ...base,
      order: { ...base.order, location: "111" },
      candidates: [card("a"), card("b")],
    });
    expect(out.every((s) => !s.top)).toBe(true);
  });

  it("符合规则的都打星 —— 不是「分最高的那张」，可以同时好几张", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("a"), card("b")],
      history: [
        { resourceId: "a", customerId: "x", location: "locag", status: "complete", days: ["2025-12-20"] },
        { resourceId: "b", customerId: "y", location: "locag", status: "complete", days: ["2025-12-20"] },
      ],
    });
    expect(out.filter((s) => s.top).length).toBe(2);
  });
});

describe("没填地点 / 地点名认不出来就不推荐", () => {
  it("没填地点：一张都不推，也不给任何信号", () => {
    const out = recommendResources({
      ...base,
      order: { ...base.order, location: null },
      candidates: [card("a"), card("b")],
      history: [
        // 就算是回头客也不推 —— 地理和类型两个主信号都判断不了的时候，
        // 硬推一张比不推更危险
        { resourceId: "a", customerId: "customer-A", location: "locbl", status: "complete", days: [] },
      ],
    });
    expect(out.every((s) => !s.top && s.signals.length === 0)).toBe(true);
  });

  it("地点名库里认不出来：同样不推", () => {
    const out = recommendResources({
      ...base,
      order: { ...base.order, location: "111" },
      candidates: [card("a")],
    });
    expect(out[0].signals).toEqual([]);
    expect(out[0].top).toBe(false);
  });
});

// 星星的规则是明说的一条，不是分数排名 —— 这一组直接测那条规则本身
describe("isRecommended：星星到底怎么给", () => {
  const 上次去过 = (m: string) => ({ lastLocation: m, orderLocation: "locag" });

  it("客人没记年龄：只看上次是不是同一片区域", () => {
    // locai 和 locag 同属 RegionB
    expect(isRecommended({ customerAge: null, holderAge: 30, ...上次去过("locai") })).toBe(true);
    // locam 在东北，不是一片
    expect(isRecommended({ customerAge: null, holderAge: 30, ...上次去过("locam") })).toBe(false);
  });

  it("**上次就去的同一个地点**也算同一片区域", () => {
    // sameRegion 的定义是「同一片但不同场」，只用它会把最该推荐的这张漏掉
    expect(isRecommended({ customerAge: null, holderAge: 30, ...上次去过("locag") })).toBe(true);
  });

  it("客人有年龄：区域对上、年龄也得在 5 岁之内", () => {
    const 同一片 = 上次去过("locai");
    expect(isRecommended({ customerAge: 30, holderAge: 30, ...同一片 })).toBe(true);
    expect(isRecommended({ customerAge: 30, holderAge: 35, ...同一片 })).toBe(true); // 正好 5 岁
    expect(isRecommended({ customerAge: 30, holderAge: 25, ...同一片 })).toBe(true); // 小 5 岁也行
    expect(isRecommended({ customerAge: 30, holderAge: 36, ...同一片 })).toBe(false);
    expect(isRecommended({ customerAge: 30, holderAge: 24, ...同一片 })).toBe(false);
  });

  it("年龄够近但区域不对 —— 不推荐（两条是「并且」不是「或者」）", () => {
    expect(isRecommended({ customerAge: 30, holderAge: 30, ...上次去过("locam") })).toBe(false);
  });

  it("**客人有年龄但资源没记生日 → 不推荐**", () => {
    // 核验看的是持有人的脸和年龄，查不了就别声称对得上
    expect(
      isRecommended({ customerAge: 30, holderAge: null, ...上次去过("locai") })
    ).toBe(false);
  });

  it("这个资源从来没排过 → 不推荐（没有「上一次」可比）", () => {
    expect(
      isRecommended({ customerAge: null, holderAge: 30, lastLocation: null, orderLocation: "locag" })
    ).toBe(false);
  });

  it("地点名认不出来 → 不推荐", () => {
    expect(
      isRecommended({ customerAge: null, holderAge: 30, lastLocation: "乱写", orderLocation: "locag" })
    ).toBe(false);
    expect(
      isRecommended({ customerAge: null, holderAge: 30, lastLocation: "locai", orderLocation: "乱写" })
    ).toBe(false);
  });

  it("容差就是 5 岁，改了这个常量测试要跟着动", () => {
    expect(AGE_TOLERANCE).toBe(5);
  });
});

describe("整条链路：星星按新规则给", () => {
  it("上次同一片区域 + 年龄差 3 岁 → 打星；年龄差 10 岁 → 不打", () => {
    const out = recommendResources({
      ...base,
      customerAge: 30,
      candidates: [
        card("close", { holderDateOfBirth: `${new Date().getUTCFullYear() - 33}-01-01` }),
        card("far", { holderDateOfBirth: `${new Date().getUTCFullYear() - 40}-01-01` }),
      ],
      history: [
        { resourceId: "close", customerId: "x", location: "locai", status: "complete", days: ["2025-12-01"] },
        { resourceId: "far", customerId: "y", location: "locai", status: "complete", days: ["2025-12-01"] },
      ],
    });
    expect(scoreOf(out, "close").top).toBe(true);
    expect(scoreOf(out, "far").top).toBe(false);
  });

  it("上一次按**结束日期**取，不按数组顺序（补录的历史单顺序是乱的）", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("a")],
      history: [
        // 数组里排在前面，但日子更早 —— 不该被当成「上一次」
        { resourceId: "a", customerId: "x", location: "locai", status: "complete", days: ["2026-01-05"] },
        { resourceId: "a", customerId: "x", location: "locam", status: "complete", days: ["2025-01-01"] },
      ],
    });
    // 最近一次是 locai（RegionB），跟 locag 同片 → 推荐
    expect(scoreOf(out, "a").top).toBe(true);
  });

  it("打了星的，理由里第一条就说清楚为什么", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("a")],
      history: [
        { resourceId: "a", customerId: "x", location: "locai", status: "complete", days: ["2025-12-01"] },
      ],
    });
    expect(scoreOf(out, "a").signals[0].code).toBe("recommended");
  });
});

// 「上一次」= **这一单之前**最近的那一次，不是「时间轴上最近的一次」。
// 日历上排在这一单后面的行程不算 —— 拿一个月后的安排推断今天的地理惯性，
// 是拿未来倒推现在。
describe("「上一次」只看这一单之前", () => {
  const use = (resourceId: string, location: string, day: string): PastUse => ({
    resourceId,
    customerId: "someone",
    location,
    status: "complete",
    days: [day],
  });

  it("用户举的例子：8 号的单，只有 9/5 去过 locbl 的那张算数", () => {
    const out = recommendResources({
      ...base,
      order: { customerId: "r", location: "locbl", demandDays: ["2026-09-08"] },
      candidates: [card("jordan"), card("zolan"), card("shengli"), card("david")],
      history: [
        // 9/5 在 9/8 之前 → 算
        use("jordan", "locbl", "2026-09-05"),
        // 下面这些都排在 9/8 之后 → 不算
        use("jordan", "locbl", "2026-09-11"),
        use("zolan", "locbn", "2026-09-13"),
        use("zolan", "locbl", "2026-09-15"),
        use("shengli", "locbm", "2026-09-20"),
        use("david", "locbm", "2026-09-12"),
      ],
    });
    expect(scoreOf(out, "jordan").top).toBe(true);
    expect(scoreOf(out, "zolan").top).toBe(false);
    expect(scoreOf(out, "shengli").top).toBe(false);
    expect(scoreOf(out, "david").top).toBe(false);
  });

  it("之前有好几次，取最近的那一次（更早那次去别处也不影响）", () => {
    const out = recommendResources({
      ...base,
      order: { customerId: "r", location: "locbl", demandDays: ["2026-09-08"] },
      candidates: [card("a")],
      history: [
        use("a", "locam", "2026-01-01"), // 更早，去的东北
        use("a", "locbn", "2026-09-05"), // 最近，B 区 → 按这个算
      ],
    });
    expect(scoreOf(out, "a").top).toBe(true);
  });

  it("最近那一次去了别的片 → 不推荐，哪怕更早去过同一片", () => {
    const out = recommendResources({
      ...base,
      order: { customerId: "r", location: "locbl", demandDays: ["2026-09-08"] },
      candidates: [card("a")],
      history: [
        use("a", "locbn", "2026-01-01"), // 更早去过B 区
        use("a", "locam", "2026-09-05"), // 最近去的东北 → 按这个算
      ],
    });
    expect(scoreOf(out, "a").top).toBe(false);
  });

  it("正好当天结束的那次不算「之前」", () => {
    const out = recommendResources({
      ...base,
      order: { customerId: "r", location: "locbl", demandDays: ["2026-09-08"] },
      candidates: [card("a")],
      history: [{ ...use("a", "locbn", "2026-09-08"), days: ["2026-09-07", "2026-09-08"] }],
    });
    expect(scoreOf(out, "a").top).toBe(false);
  });

  it("没记日期的用资源记录排不了序，跳过", () => {
    const out = recommendResources({
      ...base,
      order: { customerId: "r", location: "locbl", demandDays: ["2026-09-08"] },
      candidates: [card("a")],
      history: [{ resourceId: "a", customerId: "x", location: "locbn", status: "complete", days: [] }],
    });
    expect(scoreOf(out, "a").top).toBe(false);
  });
});
