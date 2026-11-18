import { describe, it, expect } from "vitest";
import { buildOverview, type OverviewParams, type OverviewRaw } from "./overviewModel";
import { seasonOf } from "./season";

// 排期总览的模型层。画出来的样子由浏览器测试（tests/e2e/overview.spec.ts）盯着；
// 这里盯的是实时更新要靠的那几条：同一份数据进去，排行、统计、色块出来是确定的；
// 一单改了日期 / 新加一单 / 删一单，重新算出来的跟「本来就是这样的数据」一模一样。

const season = seasonOf("2026-12-01");
const params = (over: Partial<OverviewParams> = {}): OverviewParams => ({
  season,
  isCurrentSeason: true,
  today: "2026-12-01",
  itemMode: "",
  admins: [{ id: "a1", name: "Admin1" }],
  primaryAdminId: "a1",
  orderFilter: { region: "", mtn: "", status: "", admin: "" },
  resourceFilter: { item: "", gender: "", sstatus: "active", q: "", sregion: "", smtn: "" },
  bandDays: 7,
  hrefFor: (id) => `/admin/overview?assign=${id}`,
  ...over,
});

const order = (id: string, days: string[], extra: Record<string, unknown> = {}) => ({
  id,
  customer_id: `r-${id}`,
  admin_id: null,
  location: "locaa",
  amount: 100,
  status: "created",
  demand_days: days,
  male_count: 1,
  female_count: 0,
  customers: { chat_name: `客人${id}` },
  order_assignments: [],
  ...extra,
});

const raw = (orders: any[], extra: Partial<OverviewRaw> = {}): OverviewRaw => ({
  orders,
  resources: [],
  orderNotes: [],
  dayNotes: [],
  ...extra,
});

describe("buildOverview", () => {
  it("同一天重叠的两单排进两行，不重叠的挤一行", () => {
    const m = buildOverview(
      raw([order("a", ["2026-12-01", "2026-12-02"]), order("b", ["2026-12-02"]), order("c", ["2026-12-03"])]),
      params()
    );
    const band = m.bands.find((b) => b.days.includes("2026-12-01"))!;
    expect(band.laneOf.get("a")).toBe(0);
    expect(band.laneOf.get("b")).toBe(1);
    expect(band.laneOf.get("c")).toBe(0);
    // 每单一个色块，key 里带着会变的字段（改了就重挂编辑框）
    expect(band.blocks.map((b) => b.d.orderId).sort()).toEqual(["a", "b", "c"]);
  });

  it("日历最后一带是空的（留着拖新单）", () => {
    const m = buildOverview(raw([order("a", ["2026-12-20"])]), params());
    const last = m.bands[m.bands.length - 1];
    expect(last.blocks).toHaveLength(0);
  });

  it("配了资源：分配进度、资源清单的「已排」、冲突都从同一份数据算", () => {
    const resources = [
      { id: "s1", holder_name: "Evan Li", holder_gender: "male", item_type: "alpha", validity: "{(,)}", status: "active" },
    ];
    const m = buildOverview(
      raw(
        [
          order("a", ["2026-12-01"], { order_assignments: [{ resource_id: "s1" }] }),
          order("b", ["2026-12-01"], { order_assignments: [{ resource_id: "s1" }] }),
        ],
        { resources }
      ),
      params()
    );
    expect(m.bookedDays.get("s1")).toEqual(["2026-12-01", "2026-12-01"]);
    const blockA = m.bands.flatMap((b) => b.blocks).find((b) => b.d.orderId === "a")!;
    expect(blockA.d.need.isComplete).toBe(true);
    // 同一个资源同一天配了两单：标冲突
    expect(blockA.d.cards[0].clashTitle).toContain("客人b");
  });

  it("统计：本周订单数和流水按最早那天归属", () => {
    const m = buildOverview(
      raw([order("a", ["2026-12-01"], { amount: 120 }), order("b", ["2026-12-20"], { amount: 999 })]),
      params()
    );
    expect(m.stats.weekOrderCount).toBe(1);
    expect(m.stats.weekRevenue).toBe(120);
  });

  it("按状态筛：日历和统计一起筛，资源清单那边的排期历史不筛", () => {
    const resources = [{ id: "s1", holder_name: "E", holder_gender: "male", validity: "{(,)}", status: "active" }];
    const m = buildOverview(
      raw(
        [order("a", ["2026-12-01"], { status: "complete", order_assignments: [{ resource_id: "s1" }] }), order("b", ["2026-12-02"])],
        { resources }
      ),
      params({ orderFilter: { region: "", mtn: "", status: "created", admin: "" } })
    );
    expect(m.withDays.map((o: any) => o.id)).toEqual(["b"]);
    expect(m.assignHistory).toHaveLength(1);
  });

  it("**增量合并跟整季重算一样**：改日期、新加、删掉一单后再算，跟直接拿最终数据算出来的相同", () => {
    const before = [order("a", ["2026-12-01"]), order("b", ["2026-12-02"]), order("c", ["2026-12-03"])];
    const after = [order("a", ["2026-12-05"]), order("c", ["2026-12-03"]), order("d", ["2026-12-01"])];
    // 模拟浏览器手里那份：从 before 出发，按行替换 / 删除 / 加上
    const byId = new Map(before.map((o) => [o.id, o]));
    byId.set("a", after[0]);
    byId.delete("b");
    byId.set("d", after[2]);
    const merged = buildOverview(raw([...byId.values()]), params());
    const fresh = buildOverview(raw(after), params());
    const shape = (m: ReturnType<typeof buildOverview>) =>
      m.bands.map((b) => b.blocks.map((x) => [x.key, x.d.gridRow, x.d.gridColumn]).sort());
    expect(shape(merged)).toEqual(shape(fresh));
    expect(merged.stats).toEqual(fresh.stats);
  });
});
