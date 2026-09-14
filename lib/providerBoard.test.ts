import { describe, it, expect } from "vitest";
import { buildDayWindow, packLanes, buildProviderBoard } from "./providerBoard";

describe("packLanes", () => {
  it("不重叠的挤在同一条", () => {
    const lanes = packLanes([
      { startIndex: 0, length: 2 },
      { startIndex: 2, length: 2 },
      { startIndex: 5, length: 1 },
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toHaveLength(3);
  });

  it("重叠的分到不同的条", () => {
    const lanes = packLanes([
      { startIndex: 0, length: 3 },
      { startIndex: 1, length: 3 },
      { startIndex: 2, length: 3 },
    ]);
    expect(lanes).toHaveLength(3);
  });

  it("空出来的条会被后面的块填回去", () => {
    // 第二块跟第一块撞 → 开第二条；第三块跟第一块不撞 → 回到第一条
    const lanes = packLanes([
      { startIndex: 0, length: 2 },
      { startIndex: 1, length: 5 },
      { startIndex: 3, length: 1 },
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].map((b) => b.startIndex)).toEqual([0, 3]);
  });

  it("一个块都没有", () => {
    expect(packLanes([])).toEqual([]);
  });
});

describe("buildDayWindow", () => {
  // 「往前三天」是个**下限**，管的是「更早的排期不铺出来」，不是往前补空白
  it("更早的排期不铺出来，最多回到今天往前三天", () => {
    const days = buildDayWindow("2026-09-14", ["2026-06-01", "2026-09-16"]);
    expect(days[0]).toBe("2026-09-11");
    expect(days[days.length - 1]).toBe("2026-09-16");
  });

  it("要显示的日子比「今天往前三天」还晚，就从那天开始 —— 不铺一堆空白", () => {
    const days = buildDayWindow("2026-09-14", ["2026-10-01", "2026-10-03"]);
    expect(days[0]).toBe("2026-10-01");
    expect(days).toHaveLength(3);
  });

  it("封顶 120 天，再远的不铺", () => {
    const days = buildDayWindow("2026-09-14", ["2026-09-14", "2030-01-01"]);
    expect(days).toHaveLength(120);
  });

  it("什么都没有就是空的", () => {
    expect(buildDayWindow("2026-09-14", [])).toEqual([]);
  });
});

describe("buildProviderBoard", () => {
  const maleCard = {
    id: "s-male",
    status: "active",
    holder_name: "阿男",
    holder_gender: "male",
    item_type: "alpha",
    date_range_start: null,
    date_range_end: null,
  };
  const femaleCard = { ...maleCard, id: "s-female", holder_name: "阿女", holder_gender: "female" };

  const board = (over: Partial<Parameters<typeof buildProviderBoard>[0]> = {}) =>
    buildProviderBoard({
      today: "2026-09-14",
      resources: [maleCard],
      orders: [],
      assignedByOrder: new Map(),
      bookedByResource: new Map(),
      proposed: new Set(),
      ...over,
    });

  it("我的资源能接的单子出现在我那一行", () => {
    const b = board({
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20", "2026-09-21"],
          male_count: 1,
          female_count: 0,
        },
      ],
    });
    expect(b.candidateOrderCount).toBe(1);
    expect(b.rows[0].lanes[0][0].orderId).toBe("o1");
    expect(b.rows[0].lanes[0][0].length).toBe(2);
  });

  // 配了一半的单子照样要显示 —— 1男1女只配上男资源，我的女资源还能补位
  it("配了一半的单子，缺口对得上就显示，并写清楚还差什么", () => {
    const b = buildProviderBoard({
      today: "2026-09-14",
      resources: [femaleCard],
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20"],
          male_count: 1,
          female_count: 1,
        },
      ],
      // 男资源已经配上了，还差女资源
      assignedByOrder: new Map([["o1", [{ id: "x", holder_gender: "male" }]]]),
      bookedByResource: new Map(),
      proposed: new Set(),
    });
    expect(b.candidateOrderCount).toBe(1);
    expect(b.rows[0].lanes[0][0].label).toContain("还差 1张女资源");
  });

  it("缺口跟我的资源性别对不上就不显示", () => {
    const b = buildProviderBoard({
      today: "2026-09-14",
      resources: [maleCard],
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20"],
          male_count: 1,
          female_count: 1,
        },
      ],
      // 男资源已经配齐了，只差女资源 —— 我这张男资源插不进去
      assignedByOrder: new Map([["o1", [{ id: "x", holder_gender: "male" }]]]),
      bookedByResource: new Map(),
      proposed: new Set(),
    });
    expect(b.candidateOrderCount).toBe(0);
  });

  it("那几天我这个资源已经排出去了就不显示 —— 提了也是白提", () => {
    const b = board({
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
      bookedByResource: new Map([["s-male", ["2026-09-20"]]]),
    });
    expect(b.candidateOrderCount).toBe(0);
    expect(b.rows[0].booked[0].label).toBe("已排");
  });

  it("有效期盖不住的不显示", () => {
    const b = board({
      resources: [{ ...maleCard, date_range_end: "2026-09-19" }],
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.candidateOrderCount).toBe(0);
  });

  it("类型进不了这个地点的不显示", () => {
    const b = board({
      // locaa 在册（现在 locations.ts 只收 Alpha 的地点，在册即 Alpha），手上这张是 beta
      resources: [{ ...maleCard, item_type: "beta" }],
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.candidateOrderCount).toBe(0);
  });

  it("地点名认不出来就不拦 —— 判断不了不等于不合法", () => {
    const b = board({
      resources: [{ ...maleCard, item_type: "beta" }],
      orders: [
        { id: "o1", location: "某个没见过的地点", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.candidateOrderCount).toBe(1);
  });

  it("已经提过意向的还在，但标出来了", () => {
    const b = board({
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
      proposed: new Set(["o1:s-male"]),
    });
    expect(b.rows[0].lanes[0][0].proposed).toBe(true);
    expect(b.rows[0].lanes[0][0].title).toContain("已经提过意向");
  });

  it("整单都在今天之前的不列 —— 物主再也接不了了", () => {
    const b = board({
      orders: [
        { id: "old", location: "locaa", demand_days: ["2026-09-01"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.candidateOrderCount).toBe(0);
  });

  it("只要有一天在今天或之后就还算数", () => {
    const b = board({
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-13", "2026-09-14"],
          male_count: 1,
          female_count: 0,
        },
      ],
    });
    expect(b.candidateOrderCount).toBe(1);
  });

  it("清单跟日历是同一批候选：一单切成两截，清单里只算一条", () => {
    const b = board({
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20", "2026-09-24"],
          male_count: 1,
          female_count: 0,
        },
      ],
    });
    expect(b.rows[0].lanes.flat()).toHaveLength(2); // 日历上两个块
    expect(b.candidates).toHaveLength(1); // 清单里一条
    expect(b.candidates[0].firstDay).toBe("2026-09-20");
  });

  it("清单按最早那天排序", () => {
    const b = board({
      orders: [
        { id: "b", location: "locaa", demand_days: ["2026-09-25"], male_count: 1, female_count: 0 },
        { id: "a", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.candidates.map((c) => c.orderId)).toEqual(["a", "b"]);
  });

  it("不连续的需求画成分开的两截", () =>{
    const b = board({
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20", "2026-09-21", "2026-09-24"],
          male_count: 1,
          female_count: 0,
        },
      ],
    });
    expect(b.rows[0].lanes[0]).toHaveLength(2);
  });

  // 物主看不到客户是谁，跟客户看不到持有人是谁对称
  it("块上不带客户姓名，也不带金额", () => {
    const b = board({
      orders: [
        {
          id: "o1",
          location: "locaa",
          demand_days: ["2026-09-20"],
          male_count: 1,
          female_count: 0,
          // 就算调用方多塞了这些字段进来，也不许漏到界面上
          ...({ amount: 960, customers: { first_name: "小王" } } as any),
        },
      ],
    });
    const block = b.rows[0].lanes[0][0];
    const text = `${block.label} ${block.title}`;
    expect(text).not.toContain("小王");
    expect(text).not.toContain("960");
  });
});
