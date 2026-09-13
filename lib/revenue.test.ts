import { describe, it, expect } from "vitest";
import {
  weekBounds,
  monthFirstDay,
  orderStartDay,
  countsTowardRevenue,
  countInRange,
  sumInRange,
  startsInRange,
} from "./revenue";

describe("startsInRange", () => {
  it("按最早那天判断归属，跟状态无关", () => {
    const o = { demand_days: ["2026-09-10", "2026-09-12"], status: "cancelled" };
    expect(startsInRange(o, "2026-09-07", "2026-09-13")).toBe(true);
  });

  it("起始日超出区间就不算，哪怕后面几天在区间里", () => {
    // 9/6 开始，跨进本周，但整单归上一周
    const o = { demand_days: ["2026-09-06", "2026-09-08"] };
    expect(startsInRange(o, "2026-09-07", "2026-09-13")).toBe(false);
  });

  it("没有日期的单子不算", () => {
    expect(startsInRange({ demand_days: [] }, "2026-09-07", "2026-09-13")).toBe(false);
  });
});

describe("weekBounds", () => {
  it("周一当天：本周就是这一周的周一到周日", () => {
    // 2026-09-07 是周一
    expect(weekBounds("2026-09-07")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
    });
  });

  it("周三：往回退到本周一", () => {
    expect(weekBounds("2026-09-09")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
    });
  });

  it("周日：算本周最后一天，不是下一周的开始", () => {
    expect(weekBounds("2026-09-13")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
    });
  });

  it("跨月也能正确回退", () => {
    // 2026-10-01 是周四
    expect(weekBounds("2026-10-01")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
  });
});

describe("monthFirstDay", () => {
  it("返回当月 1 号", () => {
    expect(monthFirstDay("2026-09-07")).toBe("2026-09-01");
    expect(monthFirstDay("2026-12-31")).toBe("2026-12-01");
  });
});

describe("orderStartDay", () => {
  it("取最早那一天，不管数组顺序", () => {
    expect(orderStartDay({ demand_days: ["2026-09-12", "2026-09-10"] })).toBe(
      "2026-09-10"
    );
  });

  it("没有日期返回 null", () => {
    expect(orderStartDay({ demand_days: [] })).toBeNull();
    expect(orderStartDay({})).toBeNull();
  });
});

describe("countsTowardRevenue", () => {
  it("取消和未确认不算钱", () => {
    expect(countsTowardRevenue("cancelled")).toBe(false);
    expect(countsTowardRevenue("unconfirmed")).toBe(false);
  });

  it("需退款照常算钱：钱还在我们手上，只是欠着一笔要退", () => {
    expect(countsTowardRevenue("needRefund")).toBe(true);
  });

  it("其它状态都算", () => {
    expect(countsTowardRevenue("created")).toBe(true);
    expect(countsTowardRevenue("complete")).toBe(true);
  });
});

describe("countInRange / sumInRange", () => {
  // 本周是 9/7~9/13
  const orders = [
    { demand_days: ["2026-09-08"], amount: 100, status: "complete" }, // 本周内
    { demand_days: ["2026-09-13"], amount: 50, status: "created" }, // 本周最后一天
    { demand_days: ["2026-09-02"], amount: 200, status: "complete" }, // 本月但上一周
    { demand_days: ["2026-08-20"], amount: 300, status: "complete" }, // 上个月
    { demand_days: ["2026-09-14"], amount: 999, status: "created" }, // 下周，不算
    { demand_days: ["2026-09-09"], amount: 777, status: "cancelled" }, // 本周但已取消
    { demand_days: ["2026-09-10"], amount: 888, status: "unconfirmed" }, // 本周但未确认
    { demand_days: ["2026-09-11"], amount: 60, status: "needRefund" }, // 本周，需退款照样算
  ];

  it("本周：只数本周一到周日开始的单子", () => {
    expect(countInRange(orders, "2026-09-07", "2026-09-13")).toBe(3);
    expect(sumInRange(orders, "2026-09-07", "2026-09-13")).toBe(210);
  });

  it("未确认的单：金额和单数一起排除，两个数字口径一致", () => {
    const withUnconfirmed = [
      { demand_days: ["2026-09-08"], amount: 100, status: "complete" },
      { demand_days: ["2026-09-09"], amount: 888, status: "unconfirmed" },
    ];
    expect(countInRange(withUnconfirmed, "2026-09-07", "2026-09-13")).toBe(1);
    expect(sumInRange(withUnconfirmed, "2026-09-07", "2026-09-13")).toBe(100);
  });

  it("本月：从 1 号到本周日", () => {
    expect(sumInRange(orders, "2026-09-01", "2026-09-13")).toBe(410);
  });

  it("本季：不设起点，到本周日为止全算", () => {
    expect(sumInRange(orders, null, "2026-09-13")).toBe(710);
  });

  it("本周日之后的单子一律不算，哪怕是本月的", () => {
    // 999 那一单在 9/14。原来这里写的是 `.not.toContain(999)` —— sumInRange
    // 返回的是个数字不是数组，这条断言永远成立，把 999 算进去它也绿。
    // 改成「把它挪进本周，总数正好多 999」，这才真的在盯这件事。
    const moved = orders.map((o) =>
      o.amount === 999 ? { ...o, demand_days: ["2026-09-12"] } : o
    );
    expect(sumInRange(orders, null, "2026-09-13")).toBe(710);
    expect(sumInRange(moved, null, "2026-09-13")).toBe(710 + 999);
    expect(sumInRange(orders, "2026-09-01", "2026-09-13")).toBe(410);
  });

  it("跨周的单子整单算在开始那一周，不拆", () => {
    const spanning = [
      // 9/13(周日) 开始，跨到下一周
      { demand_days: ["2026-09-13", "2026-09-14", "2026-09-15"], amount: 900, status: "complete" },
    ];
    expect(sumInRange(spanning, "2026-09-07", "2026-09-13")).toBe(900);
    // 下一周不该再算一次
    expect(sumInRange(spanning, "2026-09-14", "2026-09-20")).toBe(0);
  });

  it("金额是 null 当 0，不炸", () => {
    const noAmount = [{ demand_days: ["2026-09-08"], amount: null, status: "created" }];
    expect(sumInRange(noAmount, "2026-09-07", "2026-09-13")).toBe(0);
    expect(countInRange(noAmount, "2026-09-07", "2026-09-13")).toBe(1);
  });

  it("金额是字符串（Supabase numeric 有时候是字符串）也能加", () => {
    const strAmount = [{ demand_days: ["2026-09-08"], amount: "120.50", status: "created" }];
    expect(sumInRange(strAmount, "2026-09-07", "2026-09-13")).toBe(120.5);
  });
});
