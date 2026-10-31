import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";

// 按住色块拖到别的日子（整单平移）这条 Route Handler。
//
// 改 demand_days 的入口，分配的校验得在这儿再问一遍：挪过去撞上同一个资源在别单的日子、
// 挪出物品的有效期，都要拦，而且拦住时一天都不写。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

let fake: ReturnType<typeof createFakeSupabase>;
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

function seed(overrides: Tables = {}) {
  const base: Tables = {
    orders: [
      // 被拖的这一单：12/12、12/13、12/15（不连续），总价 300
      { id: "o-move", demand_days: ["2026-12-12", "2026-12-13", "2026-12-15"], amount: 300 },
      // 同一个资源在 12/20~12/21 配给了另一单
      { id: "o-other", demand_days: ["2026-12-20", "2026-12-21"], amount: 140 },
    ],
    resources: [
      // 整季都能用
      { id: "s-sara", holder_name: "sara lee", validity: "{(,)}" },
      // 只到 12/31（左闭右开，存出来是 2027-01-01)）
      { id: "s-amy", holder_name: "amy", validity: "{[2026-11-01,2027-01-01)}" },
    ],
    order_assignments: [
      { id: "a1", order_id: "o-move", resource_id: "s-sara" },
      { id: "a2", order_id: "o-other", resource_id: "s-sara" },
    ],
    ...overrides,
  };
  fake = createFakeSupabase(base);
  (globalThis as any).__fakeSupabase = fake.client;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/move/route");
  const req = new Request("http://test/admin/overview/move", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const order = () => fake.db.orders.find((o: any) => o.id === "o-move")!;

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("不撞的照常挪", () => {
  it("整单平移，不连续的间隔不变，总价不动", async () => {
    const r = await post({ order_id: "o-move", from_day: "2026-12-13", to_day: "2026-12-16" });
    expect(r.status).toBe(200);
    expect(order().demand_days).toEqual(["2026-12-15", "2026-12-16", "2026-12-18"]);
    expect(order().amount).toBe(300);
  });

  it("往前挪也行", async () => {
    const r = await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-10" });
    expect(r.status).toBe(200);
    expect(order().demand_days).toEqual(["2026-12-10", "2026-12-11", "2026-12-13"]);
  });

  it("放回原地什么都不写", async () => {
    const r = await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-12" });
    expect(r.status).toBe(200);
    expect(order().demand_days).toEqual(["2026-12-12", "2026-12-13", "2026-12-15"]);
  });

  it("按库里现在的日期平移，不信客户端手上那份", async () => {
    // 别人刚把这单改成了 12/1~12/2，页面上还是旧的 12/12 那份 —— 拖了 +1 天就是 12/2~12/3
    seed({
      orders: [{ id: "o-move", demand_days: ["2026-12-01", "2026-12-02"], amount: 100 }],
      order_assignments: [],
    });
    await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-13" });
    expect(order().demand_days).toEqual(["2026-12-02", "2026-12-03"]);
  });
});

describe("撞上同一个资源在别单的日子", () => {
  it("拦住，说清是哪个资源、哪一天，一天都不写", async () => {
    // +7 天：12/19、12/20、12/22 —— 12/20 撞上 o-other
    const r = await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-19" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("sara lee");
    expect(r.json.error).toContain("2026-12-20");
    expect(order().demand_days).toEqual(["2026-12-12", "2026-12-13", "2026-12-15"]);
  });
});

describe("挪出物品的有效期", () => {
  it("拦住，一天都不写", async () => {
    seed({ order_assignments: [{ id: "a1", order_id: "o-move", resource_id: "s-amy" }] });
    // +18 天：12/30、12/31、1/2 —— 1/2 已经过了 amy 的有效期
    const r = await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-30" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("amy");
    expect(r.json.error).toContain("有效期");
    expect(order().demand_days).toEqual(["2026-12-12", "2026-12-13", "2026-12-15"]);
  });

  it("还在有效期里的照常挪", async () => {
    seed({ order_assignments: [{ id: "a1", order_id: "o-move", resource_id: "s-amy" }] });
    const r = await post({ order_id: "o-move", from_day: "2026-12-12", to_day: "2026-12-26" });
    expect(r.status).toBe(200);
    expect(order().demand_days).toEqual(["2026-12-26", "2026-12-27", "2026-12-29"]);
  });
});

describe("坏参数", () => {
  it("不是 JSON / 缺参数 / 日期格式不对都是 400", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ order_id: "o-move", from_day: "2026-12-12" })).status).toBe(400);
    expect((await post({ order_id: "o-move", from_day: "12/12", to_day: "2026-12-13" })).status).toBe(400);
  });

  it("订单不存在", async () => {
    const r = await post({ order_id: "nope", from_day: "2026-12-12", to_day: "2026-12-13" });
    expect(r.status).toBe(400);
  });
});
