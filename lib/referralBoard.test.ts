import { describe, it, expect } from "vitest";
import { buildReferralCalendar } from "./referralBoard";
import type { RebateRow } from "./referral";

const base: RebateRow & { referrerName: string } = {
  orderId: "o1",
  referrerId: "a",
  referrerName: "denton",
  refereeId: "b",
  refereeName: "小被",
  refereeChat: "kukucai",
  location: "locbl",
  startDay: "2026-09-20",
  days: ["2026-09-20", "2026-09-21"],
  orderStatus: "created",
  orderAmount: 500,
  rate: 0.1,
  rebate: 50,
  counts: true,
  skipReason: null,
  paid: 0,
  hasPayout: false,
};

const today = "2026-09-16";

describe("buildReferralCalendar", () => {
  it("一笔返点画一个块，横跨它的需求日", () => {
    const b = buildReferralCalendar({ today, rows: [base] });
    const block = b.lanes.flat()[0];
    expect(block.length).toBe(2);
    expect(block.referee).toBe("kukucai");
    expect(block.referrer).toBe("denton");
    expect(b.totalDue).toBe(50);
  });

  it("不连续的日子拆成几段画 —— 跟另外三张日历一样", () => {
    // 只用 20、21、24
    const rows = [{ ...base, days: ["2026-09-20", "2026-09-21", "2026-09-24"] }];
    const b = buildReferralCalendar({ today, rows });
    const lens = b.lanes.flat().map((x) => x.length).sort();
    expect(lens).toEqual([1, 2]);
    // 但钱只算一次，不能跟着段数翻倍
    expect(b.totalDue).toBe(50);
  });

  it("不产生返点的单也画出来 —— 标出来，别让它消失", () => {
    const rows = [{ ...base, counts: false, skipReason: "window" as const, rebate: 0 }];
    const b = buildReferralCalendar({ today, rows });
    const block = b.lanes.flat()[0];
    expect(block.counts).toBe(false);
    expect(block.skipReason).toBe("window");
    expect(block.title).toContain("窗口外");
    expect(b.totalDue).toBe(0);
  });

  it("已付的从待付里扣，付超了也不冲成负数", () => {
    const b = buildReferralCalendar({
      today,
      rows: [
        { ...base, paid: 20, hasPayout: true },
        { ...base, orderId: "o2", rebate: 0, paid: 30, hasPayout: true, counts: false, skipReason: "status" },
      ],
    });
    expect(b.totalDue).toBe(30);
    expect(b.totalPaid).toBe(50);
  });

  it("互不冲突的块挤在同一条道上", () => {
    const b = buildReferralCalendar({
      today,
      rows: [base, { ...base, orderId: "o2", days: ["2026-09-25"], startDay: "2026-09-25" }],
    });
    expect(b.lanes).toHaveLength(1);
    expect(b.lanes[0]).toHaveLength(2);
  });

  it("撞在一起的分两条道", () => {
    const b = buildReferralCalendar({
      today,
      rows: [base, { ...base, orderId: "o2" }],
    });
    expect(b.lanes).toHaveLength(2);
  });

  it("没有返点时是空的", () => {
    expect(buildReferralCalendar({ today, rows: [] }).days).toEqual([]);
  });
});

describe("待付只算到本周日为止", () => {
  // today = 2026-09-16 周三 → 本周日是 09-20（口径跟 lib/revenue.ts 那三个流水数字同一把尺）
  const row = (id: string, day: string | null) => ({
    ...base,
    orderId: id,
    days: day ? [day] : [],
    startDay: day,
  });

  it("本周日当天算进来（闭区间），周一那单不算", () => {
    const b = buildReferralCalendar({
      today,
      rows: [row("sat", "2026-09-19"), row("sun", "2026-09-20"), row("mon", "2026-09-21")],
    });
    expect(b.totalDue).toBe(100);
    expect(b.laterDue).toBe(50);
  });

  it("往后的单子不进待付 —— 单子还没用，钱不该现在给", () => {
    const b = buildReferralCalendar({ today, rows: [row("far", "2026-12-25")] });
    expect(b.totalDue).toBe(0);
    expect(b.laterDue).toBe(50);
  });

  it("没填需求日的单落不进「已经发生」，归到后面", () => {
    const b = buildReferralCalendar({ today, rows: [row("nodate", null)] });
    expect(b.totalDue).toBe(0);
    expect(b.laterDue).toBe(50);
  });

  it("已付的还是整个算 —— 钱已经出去了，跟本周日没关系", () => {
    const b = buildReferralCalendar({
      today,
      rows: [{ ...row("far", "2026-12-25"), paid: 50, hasPayout: true }],
    });
    expect(b.totalPaid).toBe(50);
    expect(b.totalDue).toBe(0);
    expect(b.laterDue).toBe(0);
  });
});
