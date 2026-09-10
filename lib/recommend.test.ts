import { describe, expect, it } from "vitest";
import { recommendResources, type Candidate, type PastUse } from "./recommend";

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
        {
          resourceId: "regionB-card",
          customerId: "someone",
          location: "locai",
          status: "complete",
          days: [],
        },
        {
          resourceId: "vermont-card",
          customerId: "someone",
          location: "locam",
          status: "complete",
          days: [],
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

describe("打星星的门槛", () => {
  it("全都没什么信号时，一个都不推荐", () => {
    const out = recommendResources({
      ...base,
      order: { ...base.order, location: "111" },
      candidates: [card("a"), card("b")],
    });
    expect(out.every((s) => !s.top)).toBe(true);
  });

  it("并列最高分的都打星", () => {
    const out = recommendResources({
      ...base,
      candidates: [card("a"), card("b")],
      history: [
        { resourceId: "a", customerId: "x", location: "locag", status: "complete", days: [] },
        { resourceId: "b", customerId: "y", location: "locag", status: "complete", days: [] },
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
