import { describe, it, expect } from "vitest";
import { buildMatchBoard, candidateOf } from "./matchBoard";

const card = (over: any = {}) => ({
  id: "s1",
  status: "active",
  deleted_at: null,
  holder_name: "阿男",
  holder_gender: "male",
  item_type: "alpha",
  date_range_start: null,
  date_range_end: null,
  providers: { first_name: "admin1", last_name: null, chat: "lynnyyyy" },
  ...over,
});

const order = (days: string[], over: any = {}) => ({
  location: "locaa",
  demand_days: days,
  male_count: 1,
  female_count: 0,
  status: "created",
  customers: { first_name: "小明", last_name: null },
  ...over,
});

const m = (id: string, orderId: string, days: string[], over: any = {}) => ({
  id,
  status: "proposed",
  order_id: orderId,
  resource_id: over.resource_id ?? "s1",
  resources: over.resources ?? card(),
  orders: order(days, over.orders),
  ...(over.status ? { status: over.status } : {}),
});

const build = (matches: any[], over: any = {}) =>
  buildMatchBoard({
    today: "2026-09-14",
    matchesByOrder: matches.reduce((acc, x) => {
      acc.set(x.order_id, [...(acc.get(x.order_id) ?? []), x]);
      return acc;
    }, new Map()),
    assignedByOrder: over.assignedByOrder ?? new Map(),
    bookedByResource: over.bookedByResource ?? new Map(),
  });

describe("buildMatchBoard", () => {
  it("一个订单一个色块，画在它要滑的那几天上", () => {
    const b = build([m("m1", "o1", ["2026-09-20", "2026-09-21"])]);
    expect(b.orderCount).toBe(1);
    expect(b.lanes[0][0]).toMatchObject({ orderId: "o1", length: 2, candidates: 1 });
    // 块是两行的，几部分分开给 —— 渲染那边不用再把一个字符串拆回去
    expect(b.lanes[0][0].customer).toBe("小明");
    expect(b.lanes[0][0].location).toBe("locaa");
    expect(b.lanes[0][0].need).toBe("男0/1");
  });

  // 这是这张日历跟排期总览的区别：总览不知道谁想接
  it("色块上带着「几个人想接」和「几个现在能选」", () => {
    const b = build([
      m("m1", "o1", ["2026-09-20"]),
      m("m2", "o1", ["2026-09-20"], { resource_id: "s2", resources: card({ id: "s2" }) }),
    ]);
    expect(b.lanes[0][0].candidates).toBe(2);
    expect(b.lanes[0][0].actionable).toBe(2);
    expect(b.actionableCount).toBe(2);
  });

  it("互不冲突的单子挤在同一条道上，撞期的另起一条", () => {
    const b = build([
      m("m1", "o1", ["2026-09-20"]),
      m("m2", "o2", ["2026-09-25"]),
      m("m3", "o3", ["2026-09-20", "2026-09-21"]),
    ]);
    expect(b.lanes).toHaveLength(2);
    expect(b.lanes[0].map((x) => x.orderId)).toEqual(["o1", "o2"]);
  });

  it("没人提过意向的单子根本不上这张表", () => {
    const b = build([]);
    expect(b.days).toEqual([]);
    expect(b.orderCount).toBe(0);
  });
});

describe("candidateOf", () => {
  const today = "2026-09-14";
  const call = (over: any = {}) =>
    candidateOf(
      m("m1", "o1", over.days ?? ["2026-09-20"], over) as any,
      today,
      over.assignedByOrder ?? new Map(),
      over.bookedByResource ?? new Map()
    );

  it("配得上就是 blocked=null，能选", () => {
    const c = call();
    expect(c.blocked).toBe(null);
    expect(c.chosen).toBe(false);
    expect(c.stale).toBe(false);
    expect(c.providerLine).toBe("admin1 (lynnyyyy)");
  });

  // 点下去才报错太晚了，这张日历的全部意义就是「哪条现在能拍板」
  it("这个资源那几天已经配给别的单 → 当场说清楚配不上", () => {
    const c = call({ bookedByResource: new Map([["s1", ["2026-09-20"]]]) });
    expect(c.blocked).toContain("已经配给别的订单");
  });

  it("这一单的男资源已经配齐 → 配不上", () => {
    const c = call({ assignedByOrder: new Map([["o1", [{ id: "x", holder_gender: "male" }]]]) });
    expect(c.blocked).toContain("配齐");
  });

  it("挂牌不在出租中 → 配不上（少取 status 字段的话会全军覆没，所以锁一条）", () => {
    const c = call({ resources: card({ status: "paused" }) });
    expect(c.blocked).toBe("这个资源不在出租中");
  });

  it("那一单已经开始了就是过期，不再判配不配得上", () => {
    const c = call({ days: ["2026-09-10"] });
    expect(c.stale).toBe(true);
  });

  it("已经选中的不再跑校验 —— 它已经是事实了", () => {
    const c = call({ status: "chosen", bookedByResource: new Map([["s1", ["2026-09-20"]]]) });
    expect(c.chosen).toBe(true);
    expect(c.blocked).toBe(null);
  });
});
