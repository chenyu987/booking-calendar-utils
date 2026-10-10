import { describe, it, expect } from "vitest";
import { orderSegments, buildFootprints, summarizeFootprint, sortByFootprint, groupSegmentsBySeason } from "./footprint";
import { seasonOf } from "./season";

// 只关心日子的测试里，季随便给一个
const ANY_SEASON = { key: "25-26-na", label: "25-26 A 区", start: "2025-10-01" };
const tagOf = (day: string) => {
  const s = seasonOf(day);
  return { key: s.key, label: s.label, start: s.start };
};

describe("groupSegmentsBySeason：点开足迹按季分组", () => {
  // 段的季按那一单的第一天算，这里直接给
  const s = (start: string, seasonDay = start) => ({ label: start, start, inactive: false, season: tagOf(seasonDay) });
  it("新的季在前，组内顺序不动；一个A 区季跨两年也在同一组", () => {
    // 传进来是倒序的（最近在前）
    const groups = groupSegmentsBySeason([s("2026-02-01"), s("2026-01-05"), s("2025-12-30"), s("2025-07-10"), s("2025-03-01"), s("2024-12-24")]);
    expect(groups.map((g) => [g.season.label, g.segments.map((x) => x.start)])).toEqual([
      ["25-26 A 区", ["2026-02-01", "2026-01-05", "2025-12-30"]],
      ["24-25 B 区", ["2025-07-10"]],
      ["24-25 A 区", ["2025-03-01", "2024-12-24"]],
    ]);
  });
  it("跨季的单整单归开始那季：它后面的段夹在别的季中间，也归拢到一组，组还是新的季在前", () => {
    // 5/30 开始的一单，6/2 那段也算 24-25 A 区 —— 而且它排在最前面，旧的季先出现
    const groups = groupSegmentsBySeason([s("2025-06-02", "2025-05-30"), s("2025-06-01"), s("2025-05-30")]);
    expect(groups.map((g) => [g.season.label, g.segments.map((x) => x.start)])).toEqual([
      ["24-25 B 区", ["2025-06-01"]],
      ["24-25 A 区", ["2025-06-02", "2025-05-30"]],
    ]);
  });
  it("没有段就没有组", () => {
    expect(groupSegmentsBySeason([])).toEqual([]);
  });
});

describe("buildFootprints 的 seasons：这个人去过哪几季", () => {
  const order = (customer_id: string, demand_days: string[], status = "complete") => ({ customer_id, demand_days, location: "locaa", status });
  it("新的季在前；两季都来过的两个都有；跨季的单按第一天算", () => {
    const fp = buildFootprints([
      order("r1", ["2024-12-24"]),
      order("r1", ["2026-01-05"]),
      order("r1", ["2025-05-31", "2025-06-01"]), // 跨A 区→B 区，算 24-25 A 区
    ]).get("r1")!;
    expect(fp.seasons.map((s) => [s.label, s.inactive])).toEqual([
      ["25-26 A 区", false],
      ["24-25 A 区", false],
    ]);
  });
  it("这季只有取消/未确认的单 → 灰；同一季里有一单真用了就不灰", () => {
    const fp = buildFootprints([
      order("r1", ["2025-07-10"], "cancelled"),
      order("r1", ["2026-01-05"], "unconfirmed"),
      order("r1", ["2026-02-01"], "complete"),
    ]).get("r1")!;
    expect(fp.seasons.map((s) => [s.label, s.inactive])).toEqual([
      ["25-26 A 区", false],
      ["24-25 B 区", true],
    ]);
  });
});

describe("sortByFootprint：按足迹排 Customer", () => {
  const s = (start: string, inactive = false) => ({ label: start, start, inactive, season: ANY_SEASON });
  // 传进来的顺序就是「默认」（最近添加在前）。segments 是倒序的
  const rows = [
    { id: "new-never", segments: [], activeOrderCount: 0 },
    { id: "only-cancelled", segments: [s("2026-03-01", true)], activeOrderCount: 0 },
    { id: "veteran", segments: [s("2025-02-01"), s("2024-12-01"), s("2024-11-20")], activeOrderCount: 3 },
    { id: "recent", segments: [s("2026-08-01"), s("2025-06-10")], activeOrderCount: 2 },
    { id: "once", segments: [s("2025-01-05")], activeOrderCount: 1 },
  ];
  const ids = (sort: Parameters<typeof sortByFootprint>[1]) => sortByFootprint(rows, sort).map((r) => r.id);

  it("默认：顺序不动", () => {
    expect(ids("default")).toEqual(["new-never", "only-cancelled", "veteran", "recent", "once"]);
  });
  it("最近来过：只算真用了的，没来过的（含只黄过单的）排最后", () => {
    expect(ids("recent")).toEqual(["recent", "veteran", "once", "new-never", "only-cancelled"]);
  });
  it("最早来过：第一次来得越早越前", () => {
    expect(ids("earliest")).toEqual(["veteran", "once", "recent", "new-never", "only-cancelled"]);
  });
  it("来得最多：真用了的单数从多到少", () => {
    expect(ids("most")).toEqual(["veteran", "recent", "once", "new-never", "only-cancelled"]);
  });
  it("不改原数组", () => {
    sortByFootprint(rows, "recent");
    expect(rows[0].id).toBe("new-never");
  });
});

describe("summarizeFootprint：收起时的一行", () => {
  const seg = (start: string) => ({ label: start, start, inactive: false, season: ANY_SEASON });
  it("没有、一段、两段、三段以上", () => {
    expect(summarizeFootprint([])).toEqual({ earliest: null, latest: null, joiner: "" });
    expect(summarizeFootprint([seg("b")])).toMatchObject({ earliest: null, latest: { start: "b" }, joiner: "" });
    // 传进来是倒序的：最近的在前
    expect(summarizeFootprint([seg("c"), seg("a")])).toMatchObject({ earliest: { start: "a" }, latest: { start: "c" }, joiner: "、" });
    expect(summarizeFootprint([seg("c"), seg("b"), seg("a")])).toMatchObject({ earliest: { start: "a" }, latest: { start: "c" }, joiner: "…" });
  });
});

describe("orderSegments", () => {
  it("连续日期压成一段，带上地点", () => {
    expect(
      orderSegments({
        customer_id: "r1",
        demand_days: ["2026-01-18", "2026-01-19"],
        location: "locbl",
        status: "complete",
      })
    ).toEqual([
      { label: "1/18~1/19 locbl", start: "2026-01-18", inactive: false, season: ANY_SEASON },
    ]);
  });

  it("单天不写成区间", () => {
    const segs = orderSegments({
      customer_id: "r1",
      demand_days: ["2026-02-01"],
      location: "locbn",
      status: "complete",
    });
    expect(segs[0].label).toBe("2/1 locbn");
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

  it("取消和未确认的单标成 inactive，但不丢掉", () => {
    for (const status of ["cancelled", "unconfirmed"]) {
      const segs = orderSegments({
        customer_id: "r1",
        demand_days: ["2026-01-18"],
        location: "locbl",
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
        location: "locbl",
        status: "created",
      })
    ).toEqual([]);
    expect(
      orderSegments({
        customer_id: "r1",
        demand_days: null,
        location: "locbl",
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
      location: "locbl",
      status: "complete",
    },
    {
      customer_id: "r1",
      demand_days: ["2026-02-01", "2026-02-02", "2026-02-03"],
      location: "locbn",
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
      "2/1~2/3 locbn",
      "1/18~1/19 locbl",
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

  it("searchText 小写，日期、地点、年份都能搜到", () => {
    const r1 = buildFootprints([
      {
        customer_id: "r1",
        demand_days: ["2026-01-18"],
        location: "Locbl",
        status: "complete",
      },
    ]).get("r1")!;
    expect(r1.searchText).toContain("locbl");
    expect(r1.searchText).toContain("1/18");
    expect(r1.searchText).toContain("2026");
  });

  it("完全没下过单的 customer 不出现在 map 里", () => {
    expect(buildFootprints(orders).has("r3")).toBe(false);
  });
});
