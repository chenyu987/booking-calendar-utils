import { describe, it, expect } from "vitest";
import {
  isIsoDate,
  resolveTimelineStart,
  ordersBeforeStart,
  resolveTimelineEnd,
  ordersAfterEnd,
} from "./timelineStart";

describe("isIsoDate", () => {
  it("认标准的 YYYY-MM-DD", () => {
    expect(isIsoDate("2026-09-10")).toBe(true);
    expect(isIsoDate("2027-01-01")).toBe(true);
  });

  it("格式不对的一律不认", () => {
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("2026-9-10")).toBe(false);
    expect(isIsoDate("10/09/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate(12345)).toBe(false);
  });

  it("格式对但日子不存在的也不认 —— Date 会偷偷滚到下个月", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    // 2028 是闰年，2/29 存在
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("resolveTimelineStart", () => {
  it("指定了就原样用，不往前留两天也不退到周一", () => {
    expect(resolveTimelineStart("2026-12-03", "2026-08-31")).toBe("2026-12-03");
  });

  it("没指定或者填坏了就用默认的", () => {
    expect(resolveTimelineStart(undefined, "2026-08-31")).toBe("2026-08-31");
    expect(resolveTimelineStart("", "2026-08-31")).toBe("2026-08-31");
    expect(resolveTimelineStart("2026-02-31", "2026-08-31")).toBe("2026-08-31");
  });
});

describe("ordersBeforeStart", () => {
  const orders = [
    { id: "a", demand_days: ["2026-09-01", "2026-09-02"] },
    { id: "b", demand_days: ["2026-12-05"] },
    { id: "c", demand_days: ["2026-11-30", "2026-12-01"] }, // 跨着起点
    { id: "d", demand_days: [] },
  ];

  it("整单都在起点之前的才算被挡住", () => {
    expect(ordersBeforeStart(orders, "2026-12-01").map((o) => o.id)).toEqual(["a"]);
  });

  it("跨着起点的还看得见，不算被挡住", () => {
    expect(ordersBeforeStart(orders, "2026-12-01").map((o) => o.id)).not.toContain("c");
  });

  it("没有日期的单子本来就不在日历上，不算被这个挡住", () => {
    expect(ordersBeforeStart(orders, "2027-01-01").map((o) => o.id)).not.toContain("d");
  });

  it("起点填坏了就当没设，谁也没被挡", () => {
    expect(ordersBeforeStart(orders, "乱写")).toEqual([]);
  });
});

describe("resolveTimelineEnd", () => {
  it("指定了就原样用", () => {
    expect(resolveTimelineEnd("2027-03-31", "2026-12-01")).toBe("2027-03-31");
  });

  it("终点等于起点也行，就看一天", () => {
    expect(resolveTimelineEnd("2026-12-01", "2026-12-01")).toBe("2026-12-01");
  });

  it("没指定或者填坏了就用默认（null）", () => {
    expect(resolveTimelineEnd(undefined, "2026-12-01")).toBeNull();
    expect(resolveTimelineEnd("", "2026-12-01")).toBeNull();
    expect(resolveTimelineEnd("2027-02-31", "2026-12-01")).toBeNull();
  });

  it("**终点早于起点也当没指定**，不然日历整个消失", () => {
    expect(resolveTimelineEnd("2026-11-30", "2026-12-01")).toBeNull();
  });
});

describe("ordersAfterEnd", () => {
  const orders = [
    { id: "a", demand_days: ["2027-04-01", "2027-04-02"] },
    { id: "b", demand_days: ["2027-03-05"] },
    { id: "c", demand_days: ["2027-03-31", "2027-04-01"] }, // 跨着终点
    { id: "d", demand_days: [] },
  ];

  it("整单都在终点之后的才算被挡住", () => {
    expect(ordersAfterEnd(orders, "2027-03-31").map((o) => o.id)).toEqual(["a"]);
  });

  it("跨着终点的还看得见，不算被挡住", () => {
    expect(ordersAfterEnd(orders, "2027-03-31").map((o) => o.id)).not.toContain("c");
  });

  it("终点填坏了就当没设，谁也没被挡", () => {
    expect(ordersAfterEnd(orders, "乱写")).toEqual([]);
  });
});
