import { describe, it, expect } from "vitest";
import {
  buildDayWindow,
  buildPreviewBoard,
  providerWindowBounds,
  packLanes,
  buildProviderBoard,
  splitBoardIntoBands,
  clampProviderBandDays,
  type ProviderBlock,
  PROVIDER_BAND_DAYS_DEFAULT,
} from "./providerBoard";

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

// 物主那张只看今天往前两周、往后四周。admin 那两张不传 bounds，不受影响
describe("buildDayWindow 的硬边界", () => {
  const today = "2026-09-15";
  const bounds = providerWindowBounds(today);

  // 今天自己算一格：往后四周 = 从今天起 28 天，末尾是今天+27
  it("两头就是今天 ±（两周 / 四周）", () => {
    expect(bounds).toEqual({ from: "2026-09-01", to: "2026-10-12" });
  });

  // 末尾不拖一条空带子：界外那天不参与算终点，日历就停在最后一件真有的事上
  it("更远的日子不铺出来，也不会为它一路铺到上界", () => {
    const days = buildDayWindow(today, ["2026-09-16", "2026-11-20"], undefined, bounds);
    expect(days[days.length - 1]).toBe("2026-09-16");
  });

  it("**指定的起始日也夹** —— 设了也不能越界", () => {
    const early = buildDayWindow(today, ["2026-09-16"], "2026-05-01", bounds);
    expect(early[0]).toBe("2026-09-01");
    // 设到上界之后：起点被夹到 10/13，而要显示的日子只到 9/16，于是什么都不剩 ——
    // 跟「起始日填得比所有数据都晚」是同一个结果（那条在下面），不是新的坑
    const late = buildDayWindow(today, ["2026-09-16"], "2026-12-01", bounds);
    expect(late).toEqual([]);
  });

  it("不传 bounds 就不夹 —— admin 那两张要排整个季", () => {
    const days = buildDayWindow(today, ["2026-09-16", "2026-11-20"]);
    expect(days[days.length - 1]).toBe("2026-11-20");
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

  it("我的资源能接的单子画在日历上", () => {
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
    expect(b.lanes[0][0].orderId).toBe("o1");
    expect(b.lanes[0][0].length).toBe(2);
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
    expect(b.lanes[0][0].gap).toContain("还差 1张女资源");
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
    // 已排的日子也画在同一张日历上 —— 那正是「这几天我接不了」的原因
    const booked = b.lanes.flat().filter((x) => x.kind === "booked");
    expect(booked).toHaveLength(1);
    expect(booked[0].location).toBe("已排");
    expect(booked[0].gap).toBe("阿男"); // 哪个资源占着，块上直接写出来
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
    expect(b.lanes[0][0].proposed).toBe(true);
    expect(b.lanes[0][0].fits[0].proposed).toBe(true);
    // title 只描述单子本身，提没提过是块的状态，不写进那串文字
    expect(b.lanes[0][0].title).not.toContain("提过");
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
    expect(b.lanes.flat()).toHaveLength(2); // 日历上两个块
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
    expect(b.lanes[0]).toHaveLength(2);
  });

  // 这一条是「一行一个资源」改成「一个块一个单子」的要害：原来同一单被两个资源接得了，
  // 就在两行里各画一遍，资源越多越乱
  it("两个资源都接得了的单子，日历上只画一个块，资源收在块里", () => {
    const b = board({
      resources: [maleCard, { ...maleCard, id: "s-male-2", holder_name: "阿男二" }],
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 2, female_count: 0 },
      ],
      proposed: new Set(["o1:s-male"]),
    });
    const blocks = b.lanes.flat().filter((x) => x.kind === "candidate");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fits.map((f) => f.holderName)).toEqual(["阿男", "阿男二"]);
    // 一张提过、一张没提 —— 块整体不算「提过了」，点进去还有得选
    expect(blocks[0].fits.map((f) => f.proposed)).toEqual([true, false]);
    expect(blocks[0].proposed).toBe(false);
    // 单只有一单，但清单是按「资源 × 单」列的，所以两条
    expect(b.candidateOrderCount).toBe(1);
    expect(b.candidates).toHaveLength(2);
  });

  it("能接的资源都提过了，块才算提过", () => {
    const b = board({
      resources: [maleCard, { ...maleCard, id: "s-male-2", holder_name: "阿男二" }],
      orders: [
        { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 2, female_count: 0 },
      ],
      proposed: new Set(["o1:s-male", "o1:s-male-2"]),
    });
    expect(b.lanes.flat()[0].proposed).toBe(true);
  });

  it("四周以后的单子不画在日历上，但要报出来有几单", () => {
    const b = board({
      orders: [
        { id: "near", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
        { id: "far", location: "locaa", demand_days: ["2026-12-20"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.lanes.flat().map((x) => x.orderId)).toEqual(["near"]);
    expect(b.outsideWindowCount).toBe(1);
    // **清单不跟着窗口走**：一共几单能接不该因为日历只画四周就少报
    expect(b.candidateOrderCount).toBe(2);
    expect(b.candidates.map((c) => c.orderId).sort()).toEqual(["far", "near"]);
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
    const block = b.lanes[0][0];
    const text = `${block.location} ${block.gap} ${block.title}`;
    expect(text).not.toContain("小王");
    expect(text).not.toContain("960");
  });
});

describe("buildPreviewBoard（还没挂资源时那张）", () => {
  const orders = [
    { id: "o1", location: "locaa", demand_days: ["2026-09-20"], male_count: 1, female_count: 0 },
    { id: "o2", location: "locac", demand_days: ["2026-09-21"], male_count: 0, female_count: 2 },
  ];

  it("全部在找资源的单都画出来", () => {
    const b = buildPreviewBoard({ today: "2026-09-15", orders });
    expect(b.lanes.flat().map((x) => x.orderId).sort()).toEqual(["o1", "o2"]);
    expect(b.candidateOrderCount).toBe(2);
  });

  // 一个资源都没有 = 一个都接不了。块上留着 fits 的话界面就会给出「用哪个资源接」的按钮
  it("一个块都点不了 —— 他现在一个资源都没有", () => {
    const b = buildPreviewBoard({ today: "2026-09-15", orders });
    expect(b.lanes.flat().every((x) => x.fits.length === 0)).toBe(true);
    expect(b.candidates).toEqual([]);
  });

  // 窗口从今天起正好 28 天（今天算一格），每行 14 天就是整整两带，不会多出一格
  it("往后正好铺到今天+27，每行 14 天时是整两带", () => {
    const b = buildPreviewBoard({
      today: "2026-09-15",
      orders: [
        { id: "a", location: "locaa", demand_days: ["2026-09-15"], male_count: 1, female_count: 0 },
        { id: "z", location: "locaa", demand_days: ["2026-11-30"], male_count: 1, female_count: 0 },
        { id: "edge", location: "locaa", demand_days: ["2026-10-12"], male_count: 1, female_count: 0 },
      ],
    });
    expect(b.days[0]).toBe("2026-09-15");
    expect(b.days[b.days.length - 1]).toBe("2026-10-12");
    expect(b.days).toHaveLength(28);
  });

  it("人数一个都没填的老单子写「人数没填」，不冒充已配齐", () => {
    const b = buildPreviewBoard({
      today: "2026-09-15",
      orders: [{ id: "old", location: "locaa", demand_days: ["2026-09-20"], male_count: 0, female_count: 0 }],
    });
    expect(b.lanes.flat()[0].gap).toBe("人数没填");
  });

  it("整单都在今天之前的不画 —— 跟挂了资源之后同一条口径", () => {
    const b = buildPreviewBoard({
      today: "2026-09-15",
      orders: [{ id: "old", location: "locaa", demand_days: ["2026-09-01"], male_count: 1, female_count: 0 }],
    });
    expect(b.lanes.flat()).toEqual([]);
  });
});

describe("buildDayWindow 指定起始日", () => {
  it("指定了就原样用，不再往前留那三天", () => {
    const days = buildDayWindow("2026-09-14", ["2026-09-11", "2026-09-20"], "2026-09-16");
    expect(days[0]).toBe("2026-09-16");
    expect(days[days.length - 1]).toBe("2026-09-20");
  });

  it("指定的起点晚过所有日子 —— 一天都不铺，不是报错", () => {
    expect(buildDayWindow("2026-09-14", ["2026-09-16"], "2026-10-01")).toEqual([]);
  });
});

describe("clampProviderBandDays", () => {
  it("超出上下限就夹住", () => {
    expect(clampProviderBandDays(1)).toBe(7);
    expect(clampProviderBandDays(999)).toBe(42);
  });

  it("不是数字就回默认 —— 别算出「一行 0 天」把渲染卡死", () => {
    expect(clampProviderBandDays("")).toBe(PROVIDER_BAND_DAYS_DEFAULT);
    expect(clampProviderBandDays(undefined)).toBe(PROVIDER_BAND_DAYS_DEFAULT);
    expect(clampProviderBandDays(NaN)).toBe(PROVIDER_BAND_DAYS_DEFAULT);
  });
});

type TestRow = { booked: ProviderBlock[]; lanes: ProviderBlock[][] };

describe("splitBoardIntoBands", () => {
  const board = {
    days: Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
    candidates: [],
    candidateOrderCount: 0,
    rows: [
      {
        resourceId: "s1",
        booked: [
          { orderId: "", startIndex: 0, length: 2, label: "已排", title: "", proposed: false },
        ],
        lanes: [
          // 跨接缝的一段：第 6 天起 5 天，7 天一行的话会被切成 1 天 + 4 天
          [{ orderId: "o1", startIndex: 5, length: 5, label: "a", title: "", proposed: false }],
          [{ orderId: "o2", startIndex: 15, length: 2, label: "b", title: "", proposed: false }],
        ],
      },
    ],
  };

  it("按每行天数切段", () => {
    const bands = splitBoardIntoBands<ProviderBlock, TestRow>(board as any, 7);
    expect(bands).toHaveLength(3); // 7 + 7 + 6
    expect(bands[0].days).toHaveLength(7);
    expect(bands[2].days).toHaveLength(6);
  });

  it("跨接缝的块在上下两行各画一截，下标重新按本行算", () => {
    const bands = splitBoardIntoBands<ProviderBlock, TestRow>(board as any, 7);
    const first = bands[0].rows[0].lanes[0][0];
    const second = bands[1].rows[0].lanes[0][0];
    expect(first).toMatchObject({ startIndex: 5, length: 2 }); // 第 6、7 天
    expect(second).toMatchObject({ startIndex: 0, length: 3 }); // 第 8、9、10 天
  });

  it("空掉的 lane 压掉 —— 块贴着行顶排，不悬在行底", () => {
    const bands = splitBoardIntoBands<ProviderBlock, TestRow>(board as any, 7);
    // o2 全局在第 2 条 lane 上，但第三行里第 1 条是空的，压掉之后它上到第 1 条
    expect(bands[2].rows[0].lanes).toHaveLength(1);
    expect(bands[2].rows[0].lanes[0][0].orderId).toBe("o2");
    // 第一行只有 o1，也是一条
    expect(bands[0].rows[0].lanes).toHaveLength(1);
  });

  it("压掉空 lane 不打乱相对顺序", () => {
    const twoLanes = {
      ...board,
      rows: [
        {
          resourceId: "s1",
          booked: [],
          lanes: [
            [{ orderId: "a", startIndex: 0, length: 3, label: "", title: "", proposed: false }],
            [{ orderId: "b", startIndex: 1, length: 3, label: "", title: "", proposed: false }],
          ],
        },
      ],
    };
    const bands = splitBoardIntoBands<ProviderBlock, TestRow>(twoLanes as any, 7);
    expect(bands[0].rows[0].lanes.map((l) => l[0].orderId)).toEqual(["a", "b"]);
  });

  it("已排的段也跟着切", () => {
    const bands = splitBoardIntoBands<ProviderBlock, TestRow>(board as any, 7);
    expect(bands[0].rows[0].booked).toHaveLength(1);
    expect(bands[1].rows[0].booked).toHaveLength(0);
  });
});
