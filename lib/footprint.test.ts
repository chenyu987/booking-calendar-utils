import { describe, it, expect } from "vitest";
import { orderSegments, buildFootprints } from "./footprint";

describe("orderSegments", () => {
  it("连续日期压成一段，带上地点", () => {
    expect(
      orderSegments({
        customer_id: "r1",
        demand_days: ["2026-01-18", "2026-01-19"],
        location: "locbg",
        status: "complete",
      })
    ).toEqual([{ label: "1/18~1/19 locbg", start: "2026-01-18", inactive: false }]);
  });

  it("单天不写成区间", () => {
    const segs = orderSegments({
      customer_id: "r1",
      demand_days: ["2026-02-01"],
      location: "locbi",
      status: "complete",
    });
    expect(segs[0].label).toBe("2/1 locbi");
  });

  it("不连续的日期拆成多段（只用 24、25、27）", () => {
    const segs = orderSegments({
      customer_id: "r1",
      demand_days: ["2026-01-24", "2026-01-25", "2026-01-27"],
      location: "thredbo",
      status: "complete",
    });
    expect(segs.map((s) => s.label)).toEqual([
      "1/24~1/25 thredbo",
      "1/27 thredbo",
    ]);
  });

  it("没填地点就只显示日期", () => {
    const segs = orderSegments({
      customer_id: "r1",
      demand_days: ["2026-03-05"],
      location: null,
      status: "created",
    });
    expect(segs[0].label).toBe("3/5");
  });

  it("取消和退款的单标成 inactive，但不丢掉", () => {
    for (const status of ["cancelled", "refunded"]) {
      const segs = orderSegments({
        customer_id: "r1",
        demand_days: ["2026-01-18"],
        location: "locbg",
        status,
      });
      expect(segs).toHaveLength(1);
      expect(segs[0].inactive).toBe(true);
    }
  });

  it("没有日期的单不产生足迹", () => {
    expect(
      orderSegments({
        customer_id: "r1",
        demand_days: [],
        location: "locbg",
        status: "created",
      })
    ).toEqual([]);
    expect(
      orderSegments({
        customer_id: "r1",
        demand_days: null,
        location: "locbg",
        status: "created",
      })
    ).toEqual([]);
  });
});

describe("buildFootprints", () => {
  const orders = [
    {
      customer_id: "r1",
      demand_days: ["2026-01-18", "2026-01-19"],
      location: "locbg",
      status: "complete",
    },
    {
      customer_id: "r1",
      demand_days: ["2026-02-01", "2026-02-02", "2026-02-03"],
      location: "locbi",
      status: "complete",
    },
    {
      customer_id: "r2",
      demand_days: ["2026-01-05"],
      location: "buller",
      status: "cancelled",
    },
  ];

  it("按 customer 分组", () => {
    const map = buildFootprints(orders);
    expect([...map.keys()].sort()).toEqual(["r1", "r2"]);
  });

  it("段按时间倒序，最近的在前", () => {
    const r1 = buildFootprints(orders).get("r1")!;
    expect(r1.segments.map((s) => s.label)).toEqual([
      "2/1~2/3 locbi",
      "1/18~1/19 locbg",
    ]);
  });

  it("orderCount 数的是单不是段", () => {
    const r1 = buildFootprints([
      ...orders,
      {
        customer_id: "r1",
        demand_days: ["2026-03-01", "2026-03-03"],
        location: "akaah",
        status: "complete",
      },
    ]).get("r1")!;
    expect(r1.orderCount).toBe(3);
    expect(r1.segments).toHaveLength(4);
  });

  it("searchText 小写，日期和地点都能搜到", () => {
    const r1 = buildFootprints([
      {
        customer_id: "r1",
        demand_days: ["2026-01-18"],
        location: "Locbg",
        status: "complete",
      },
    ]).get("r1")!;
    expect(r1.searchText).toContain("locbg");
    expect(r1.searchText).toContain("1/18");
  });

  it("完全没下过单的 customer 不出现在 map 里", () => {
    expect(buildFootprints(orders).has("r3")).toBe(false);
  });
});
