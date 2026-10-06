import { describe, it, expect } from "vitest";
import {
  DEFAULT_REFERRAL_RATE,
  boardTotals,
  buildReferralBoard,
  effectiveRate,
  formatRate,
  isPayoutOnDeadOrder,
  parseRatePercent,
  referralBlockReason,
  referralChain,
  formatReferralWindow,
  parseReferralWindow,
  customerHandle,
  resolveCustomer,
  suggestCustomers,
  withinReferralWindow,
  type ReferralCustomer,
} from "./referral";

function byId(...rs: ReferralCustomer[]) {
  return new Map(rs.map((r) => [r.id, r]));
}

const A: ReferralCustomer = { id: "a", first_name: "阿介" };
const B: ReferralCustomer = { id: "b", first_name: "小被", referred_by: "a" };

describe("referralBlockReason", () => {
  it("正常建立返 null", () => {
    const m = byId(A, { id: "c", first_name: "小新" });
    expect(referralBlockReason({ refereeId: "c", referrerId: "a", byId: m })).toBeNull();
  });

  it("不能自己介绍自己", () => {
    expect(
      referralBlockReason({ refereeId: "a", referrerId: "a", byId: byId(A) })
    ).toBe("不能自己介绍自己");
  });

  it("已经有别的介绍人：不许直接改，要先解除", () => {
    const m = byId(A, B, { id: "c", first_name: "老王" });
    const reason = referralBlockReason({ refereeId: "b", referrerId: "c", byId: m });
    // 直接改会把这个人**所有历史单子**的返点一起挪给新介绍人
    expect(reason).toContain("要改先解除");
  });

  it("同一条关系重复建，明说已经有了", () => {
    expect(
      referralBlockReason({ refereeId: "b", referrerId: "a", byId: byId(A, B) })
    ).toBe("这条介绍关系已经有了");
  });

  it("成环要拦：A 介绍 B 之后，B 不能反过来介绍 A", () => {
    const reason = referralBlockReason({
      refereeId: "a",
      referrerId: "b",
      byId: byId(A, B),
    });
    expect(reason).toContain("绕成环");
  });

  it("长一点的环也要拦：A→B→C 之后 C 不能介绍 A", () => {
    const m = byId(A, B, { id: "c", first_name: "小三", referred_by: "b" });
    const reason = referralBlockReason({ refereeId: "a", referrerId: "c", byId: m });
    expect(reason).toContain("绕成环");
  });

  it("找不到人不给建", () => {
    expect(
      referralBlockReason({ refereeId: "x", referrerId: "a", byId: byId(A) })
    ).toBe("找不到被介绍人");
  });
});

describe("referralChain", () => {
  it("库里已经有环也不能转死循环", () => {
    // 直接改库、或者以前漏了校验留下的脏数据
    const m = byId({ id: "a", referred_by: "b" }, { id: "b", referred_by: "a" });
    expect(referralChain("a", m)).toEqual(["b"]);
  });
});

describe("比例", () => {
  it("被介绍人那一行有快照就用快照，没有才跟全局默认", () => {
    expect(effectiveRate({ id: "b", referral_rate: 0.05 }, 0.1)).toBe(0.05);
    expect(effectiveRate({ id: "b" }, 0.2)).toBe(0.2);
    expect(effectiveRate({ id: "b" })).toBe(DEFAULT_REFERRAL_RATE);
  });

  it("numeric 从库里回来是字符串，也认", () => {
    expect(effectiveRate({ id: "b", referral_rate: "0.0800" }, 0.1)).toBe(0.08);
  });

  it("0% 是有效比例，不能当成没填而退回默认", () => {
    expect(effectiveRate({ id: "b", referral_rate: 0 }, 0.1)).toBe(0);
  });

  it("formatRate 不带多余的小数", () => {
    expect(formatRate(0.1)).toBe("10%");
    expect(formatRate(0.075)).toBe("7.5%");
  });

  it("空着 = 跟随默认，填错了 = 报错，两件事要分开", () => {
    expect(parseRatePercent("")).toEqual({ ok: true, rate: null });
    expect(parseRatePercent("10")).toEqual({ ok: true, rate: 0.1 });
    expect(parseRatePercent("7.5")).toEqual({ ok: true, rate: 0.075 });
    // 当成 null 的话会静悄悄变成默认比例，没人发现填错了
    expect(parseRatePercent("abc").ok).toBe(false);
    expect(parseRatePercent("-1").ok).toBe(false);
    expect(parseRatePercent("101").ok).toBe(false);
  });
});

describe("buildReferralBoard", () => {
  const customers: ReferralCustomer[] = [
    { id: "a", first_name: "阿介" },
    { id: "b", first_name: "小被", referred_by: "a" },
  ];
  const order = (over: Partial<any> = {}) => ({
    id: "o1",
    customer_id: "b",
    demand_days: ["2026-09-10", "2026-09-11"],
    location: "locbl",
    amount: 500,
    status: "created",
    ...over,
  });

  it("按默认比例算返点", () => {
    const [g] = buildReferralBoard({ customers, orders: [order()], payouts: [] });
    expect(g.referrerName).toBe("阿介");
    expect(g.rows[0].rebate).toBe(50);
    expect(g.outstanding).toBe(50);
  });

  it("比例快照盖过全局默认", () => {
    const [g] = buildReferralBoard({
      customers: [customers[0], { ...customers[1], referral_rate: 0.2 }],
      orders: [order()],
      payouts: [],
      defaultRate: 0.1,
    });
    expect(g.rows[0].rebate).toBe(100);
  });

  it("取消/未确认的单不产生返点 —— 口径跟流水一致", () => {
    for (const status of ["cancelled", "unconfirmed"]) {
      const [g] = buildReferralBoard({
        customers,
        orders: [order({ status })],
        payouts: [],
      });
      expect(g.rows[0].counts).toBe(false);
      expect(g.rows[0].rebate).toBe(0);
      expect(g.outstanding).toBe(0);
    }
  });

  it("needRefund 照常返 —— 钱还在我们手上", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order({ status: "needRefund" })],
      payouts: [],
    });
    expect(g.rows[0].rebate).toBe(50);
  });

  it("付过的从待付里扣掉", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order()],
      payouts: [{ order_id: "o1", referrer_id: "a", amount: 30 }],
    });
    expect(g.totalPaid).toBe(30);
    expect(g.outstanding).toBe(20);
  });

  it("别人的付款记录不算到这个介绍人头上", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order()],
      payouts: [{ order_id: "o1", referrer_id: "zzz", amount: 30 }],
    });
    expect(g.totalPaid).toBe(0);
    expect(g.outstanding).toBe(50);
  });

  it("已经付过、单子后来黄了：行要留着并标出来", () => {
    // 整行去掉的话，已经花出去的钱就从账上凭空消失了
    const [g] = buildReferralBoard({
      customers,
      orders: [order({ status: "cancelled" })],
      payouts: [{ order_id: "o1", referrer_id: "a", amount: 50 }],
    });
    expect(g.rows).toHaveLength(1);
    expect(isPayoutOnDeadOrder(g.rows[0])).toBe(true);
    // 该返 0、已付 50，但不往回冲成负的待付
    expect(g.outstanding).toBe(0);
    expect(g.totalPaid).toBe(50);
  });

  it("介绍了人但对方还没下单，也要出现在台账上", () => {
    const [g] = buildReferralBoard({ customers, orders: [], payouts: [] });
    expect(g.refereeCount).toBe(1);
    expect(g.rows).toHaveLength(0);
  });

  it("没有任何介绍关系时是空的", () => {
    expect(
      buildReferralBoard({ customers: [customers[0]], orders: [order()], payouts: [] })
    ).toEqual([]);
  });

  it("referred_by 指向一个不存在的人：忽略，不能造出一个空组", () => {
    const [g] = buildReferralBoard({
      customers: [{ id: "b", first_name: "小被", referred_by: "ghost" }],
      orders: [order()],
      payouts: [],
    });
    expect(g).toBeUndefined();
  });

  it("金额没填的单算 0，不能变成 NaN 把整列加成 NaN", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order({ amount: null }), order({ id: "o2", amount: 500 })],
      payouts: [],
    });
    expect(g.totalRebate).toBe(50);
  });

  it("还欠钱的介绍人排前面", () => {
    const rs: ReferralCustomer[] = [
      { id: "a", first_name: "阿介" },
      { id: "b", first_name: "小被", referred_by: "a" },
      { id: "c", first_name: "老介" },
      { id: "d", first_name: "小丁", referred_by: "c" },
    ];
    const groups = buildReferralBoard({
      customers: rs,
      orders: [order(), order({ id: "o2", customer_id: "d", amount: 1000 })],
      payouts: [],
    });
    expect(groups.map((g) => g.referrerName)).toEqual(["老介", "阿介"]);
  });

  it("boardTotals 把几组加起来", () => {
    const groups = buildReferralBoard({
      customers,
      orders: [order(), order({ id: "o2", amount: 300 })],
      payouts: [{ order_id: "o2", referrer_id: "a", amount: 10 }],
    });
    expect(boardTotals(groups)).toEqual({
      referrers: 1,
      referees: 1,
      totalRebate: 80,
      totalPaid: 10,
      outstanding: 70,
      // 不传收口日就不算「本周待付」
      dueNow: 0,
    });
  });
});

describe("resolveCustomer（界面上拿昵称指人）", () => {
  const people: ReferralCustomer[] = [
    { id: "t", first_name: "Terence", last_name: "Wu", chat_name: "terence" },
    { id: "d", first_name: "Denton", chat_name: "denton_88" },
    { id: "n", first_name: "没聊天的", chat_name: null },
  ];

  it("按昵称找得到", () => {
    expect(resolveCustomer("denton_88", people)).toEqual({ ok: true, id: "d" });
  });

  it("大小写和前后空格不算数", () => {
    expect(resolveCustomer("  Terence ", people)).toEqual({ ok: true, id: "t" });
  });

  it("没记聊天的退回按姓名找", () => {
    expect(resolveCustomer("没聊天的", people)).toEqual({ ok: true, id: "n" });
  });

  it("聊天优先于姓名：同一个字既是 A 的聊天又是 B 的名字时不含糊", () => {
    const tricky: ReferralCustomer[] = [
      { id: "a", first_name: "张三", chat_name: "denton" },
      { id: "b", first_name: "denton", chat_name: "zzz" },
    ];
    expect(resolveCustomer("denton", tricky)).toEqual({ ok: true, id: "a" });
  });

  it("找不到就报错，不能猜", () => {
    const r = resolveCustomer("查无此人", people);
    expect(r.ok).toBe(false);
    // 猜错一个人，返点会长期发给错的人，而且台账上看着是对的，没人会发现
    if (!r.ok) expect(r.reason).toContain("找不到");
  });

  it("对上多个也报错", () => {
    const dup: ReferralCustomer[] = [
      { id: "x", first_name: "小明", chat_name: "ming" },
      { id: "y", first_name: "小明", chat_name: "ming" },
    ];
    const r = resolveCustomer("ming", dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("2 个人");
  });

  it("空的当没填", () => {
    expect(resolveCustomer("   ", people)).toEqual({ ok: false, reason: "昵称没填" });
  });

  it("customerHandle：有聊天用聊天，没有才用姓名", () => {
    expect(customerHandle(people[0])).toBe("terence");
    expect(customerHandle(people[2])).toBe("没聊天的");
  });
});

describe("suggestCustomers（打了字才给候选）", () => {
  const people: ReferralCustomer[] = [
    { id: "1", first_name: "Denton", chat_name: "denton" },
    { id: "2", first_name: "老邓", chat_name: "xxdenyy" },
    { id: "3", first_name: "denny", chat_name: null },
    { id: "4", first_name: "无关", chat_name: "zzz" },
  ];

  it("空着不给候选 —— 一聚焦倒出全部几百人那不是补全是干扰", () => {
    expect(suggestCustomers("", people)).toEqual([]);
    expect(suggestCustomers("   ", people)).toEqual([]);
  });

  it("前缀命中排在包含命中前面", () => {
    const ids = suggestCustomers("den", people).map((r) => r.id);
    expect(ids.slice(0, 2).sort()).toEqual(["1", "3"]);
    expect(ids[2]).toBe("2");
  });

  it("聊天和姓名都认，不相干的不给", () => {
    expect(suggestCustomers("denton", people).map((r) => r.id)).toEqual(["1"]);
    expect(suggestCustomers("老邓", people).map((r) => r.id)).toEqual(["2"]);
    expect(suggestCustomers("qqq", people)).toEqual([]);
  });

  it("有上限，不会一次糊几百条出来", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      first_name: `mm${i}`,
      chat_name: `mm${i}`,
    }));
    expect(suggestCustomers("mm", many).length).toBe(8);
    expect(suggestCustomers("mm", many, 3).length).toBe(3);
  });
});

describe("返点生效窗口（按活动日）", () => {
  const w = { referral_from: "2026-09-01", referral_until: "2026-12-01" };

  it("两头都空 = 不设限，什么都算", () => {
    expect(withinReferralWindow("2020-01-01", {})).toBe(true);
    // 没日期的单在不设窗口时也照常算
    expect(withinReferralWindow(null, {})).toBe(true);
  });

  it("两头都是闭区间", () => {
    expect(withinReferralWindow("2026-09-01", w)).toBe(true);
    expect(withinReferralWindow("2026-12-01", w)).toBe(true);
    expect(withinReferralWindow("2026-08-31", w)).toBe(false);
    expect(withinReferralWindow("2026-12-02", w)).toBe(false);
  });

  it("只设一头，另一头不设限", () => {
    expect(withinReferralWindow("2030-01-01", { referral_from: "2026-09-01" })).toBe(true);
    expect(withinReferralWindow("2020-01-01", { referral_from: "2026-09-01" })).toBe(false);
    expect(withinReferralWindow("2020-01-01", { referral_until: "2026-12-01" })).toBe(true);
  });

  it("设了窗口但这一单没填需求日 → 不算（落不进按日期切的窗口）", () => {
    expect(withinReferralWindow(null, w)).toBe(false);
  });

  it("显示走 formatDateRange，跟资源有效期同一份", () => {
    expect(formatReferralWindow(w)).toBe("2026-09-01 ~ 2026-12-01");
    expect(formatReferralWindow({ referral_from: "2026-09-01" })).toBe("2026-09-01 起");
    expect(formatReferralWindow({ referral_until: "2026-12-01" })).toBe("截至 2026-12-01");
    expect(formatReferralWindow({})).toBe("不限");
  });

  it("parseReferralWindow：空 = 不设限，填错 = 报错，两件事分开", () => {
    expect(parseReferralWindow("", "")).toEqual({ ok: true, from: null, until: null });
    expect(parseReferralWindow("2026-09-01", "")).toEqual({
      ok: true,
      from: "2026-09-01",
      until: null,
    });
    // 混成一件事的话，填错的那头会静悄悄变成「不设限」，窗口比你以为的宽
    expect(parseReferralWindow("9/1/2026", "").ok).toBe(false);
    // 格式对但日子不存在
    expect(parseReferralWindow("2026-02-31", "").ok).toBe(false);
  });

  it("起点晚于终点要拦 —— 那样窗口是空的，界面上却看着设好了", () => {
    const r = parseReferralWindow("2026-12-01", "2026-09-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("填反了");
  });
});

describe("窗口作用在台账上", () => {
  const customers: ReferralCustomer[] = [
    { id: "a", first_name: "阿介" },
    {
      id: "b",
      first_name: "小被",
      referred_by: "a",
      referral_from: "2026-09-01",
      referral_until: "2026-12-01",
    },
  ];
  const order = (id: string, days: string[], status = "created") => ({
    id,
    customer_id: "b",
    demand_days: days,
    location: "locbl",
    amount: 500,
    status,
  });

  it("窗口内的算，窗口外的不算但行留着", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order("in", ["2026-10-04"]), order("out", ["2026-12-20"])],
      payouts: [],
    });
    expect(g.totalRebate).toBe(50);
    expect(g.rows).toHaveLength(2);
    const out = g.rows.find((r) => r.orderId === "out")!;
    expect(out.counts).toBe(false);
    expect(out.skipReason).toBe("window");
    expect(out.rebate).toBe(0);
  });

  it("跨界的单按最早那天整单算进来，不按天拆", () => {
    // 11/28–12/03 跨过 12/1，最早那天在窗口里 → 整单算
    const [g] = buildReferralBoard({
      customers,
      orders: [order("x", ["2026-11-28", "2026-12-03"])],
      payouts: [],
    });
    expect(g.rows[0].counts).toBe(true);
    expect(g.totalRebate).toBe(50);
  });

  it("单子黄了压过窗口 —— 取消的单说「窗口外」是误导", () => {
    const [g] = buildReferralBoard({
      customers,
      orders: [order("c", ["2026-12-20"], "cancelled")],
      payouts: [],
    });
    expect(g.rows[0].skipReason).toBe("status");
  });

  it("没设窗口的关系一切照旧", () => {
    const [g] = buildReferralBoard({
      customers: [customers[0], { id: "b", first_name: "小被", referred_by: "a" }],
      orders: [order("x", ["2030-01-01"])],
      payouts: [],
    });
    expect(g.rows[0].counts).toBe(true);
    expect(g.rows[0].skipReason).toBeNull();
  });
});

describe("本周待付（boardTotals 的 dueNow）", () => {
  const customers: ReferralCustomer[] = [
    { id: "a", first_name: "阿介" },
    { id: "b", first_name: "小被", referred_by: "a" },
  ];
  const ord = (id: string, day: string) => ({
    id,
    customer_id: "b",
    demand_days: [day],
    location: "locbl",
    amount: 500,
    status: "created",
  });

  it("只算到收口那天为止，往后的不进「本周待付」", () => {
    const groups = buildReferralBoard({
      customers,
      orders: [ord("in", "2026-09-20"), ord("out", "2026-09-21")],
      payouts: [],
    });
    const t = boardTotals(groups, "2026-09-20");
    expect(t.dueNow).toBe(50);
    // 合计还是全部 —— 两个数各回答各的问题
    expect(t.outstanding).toBe(100);
  });

  it("已付的从本周待付里扣掉", () => {
    const groups = buildReferralBoard({
      customers,
      orders: [ord("in", "2026-09-20")],
      payouts: [{ order_id: "in", referrer_id: "a", amount: 20 }],
    });
    expect(boardTotals(groups, "2026-09-20").dueNow).toBe(30);
  });

  it("不传收口日就不算这个数，老调用方不受影响", () => {
    const groups = buildReferralBoard({
      customers,
      orders: [ord("in", "2026-09-20")],
      payouts: [],
    });
    expect(boardTotals(groups).dueNow).toBe(0);
    expect(boardTotals(groups).outstanding).toBe(50);
  });
});
