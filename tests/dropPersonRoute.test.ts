import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";
import { dropPersonOptions } from "@/lib/dropPerson";

// 「少一个人」：人数减一、总价按比例减、配给这个人的资源退回去。
// 服务端拦的那几条（只剩一个人、没这个性别、资源都配了却不说退哪张、点名的资源不是这单的）
// 界面上的菜单本来就不会列，但 curl 绕得过去 —— 所以在这儿盯着。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
let fake: ReturnType<typeof createFakeSupabase>;
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

function seed(overrides: Tables = {}) {
  fake = createFakeSupabase({
    orders: [
      {
        // 1 男 1 女两天 $160，两个资源都配了
        id: "o1",
        demand_days: ["2026-11-21", "2026-11-22"],
        male_count: 1,
        female_count: 1,
        amount: 160,
        status: "itemAssigned",
      },
    ],
    resources: [
      { id: "s-m", holder_name: "Evan", holder_gender: "male" },
      { id: "s-m2", holder_name: "James", holder_gender: "male" },
      { id: "s-f", holder_name: "Elaine", holder_gender: "female" },
    ],
    order_assignments: [
      { id: "a1", order_id: "o1", resource_id: "s-m" },
      { id: "a2", order_id: "o1", resource_id: "s-f" },
    ],
    ...overrides,
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/drop-person/route");
  const req = new Request("http://test/admin/overview/drop-person", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const order = () => fake.db.orders.find((o: any) => o.id === "o1");
const assigned = () => fake.db.order_assignments.map((a: any) => a.resource_id).sort();

beforeEach(() => {
  vi.resetModules();
  seed();
});

const drop = (...ds: [string, string | null][]) => ({
  order_id: "o1",
  drops: ds.map(([gender, resource_id]) => ({ gender, resource_id })),
});

describe("少几个人", () => {
  it("1男1女配齐了，少那个女的：女资源退回去、人数和金额各减一半、还是配齐", async () => {
    const r = await post(drop(["female", "s-f"]));
    expect(r.status).toBe(200);
    expect(assigned()).toEqual(["s-m"]);
    expect(order()).toMatchObject({ male_count: 1, female_count: 0, amount: 80, status: "itemAssigned" });
  });

  it("一次少两个：3男1女 $400，退两张男资源 → 1男1女 $200", async () => {
    seed({
      orders: [{ id: "o1", demand_days: ["2026-11-21"], male_count: 3, female_count: 1, amount: 400, status: "itemAssigned" }],
      resources: [
        { id: "s-m", holder_gender: "male" },
        { id: "s-m2", holder_gender: "male" },
        { id: "s-m3", holder_gender: "male" },
        { id: "s-f", holder_gender: "female" },
      ],
      order_assignments: ["s-m", "s-m2", "s-m3", "s-f"].map((sid, i) => ({ id: `a${i}`, order_id: "o1", resource_id: sid })),
    });
    const r = await post(drop(["male", "s-m"], ["male", "s-m3"]));
    expect(r.status).toBe(200);
    expect(assigned()).toEqual(["s-f", "s-m2"]);
    expect(order()).toMatchObject({ male_count: 1, female_count: 1, amount: 200, status: "itemAssigned" });
  });

  it("少的是还没分配的那个：不退资源，created 反倒配齐推到 itemAssigned", async () => {
    seed({
      orders: [{ id: "o1", demand_days: ["2026-11-21"], male_count: 2, female_count: 0, amount: 100, status: "created" }],
      order_assignments: [{ id: "a1", order_id: "o1", resource_id: "s-m" }],
    });
    const r = await post(drop(["male", null]));
    expect(r.status).toBe(200);
    expect(assigned()).toEqual(["s-m"]);
    expect(order()).toMatchObject({ male_count: 1, amount: 50, status: "itemAssigned" });
  });

  it("资源都配了却说少一个没分配的 → 拦住，一个字都不写", async () => {
    const r = await post(drop(["male", null]));
    expect(r.status).toBe(400);
    expect(assigned()).toEqual(["s-f", "s-m"]);
    expect(order()).toMatchObject({ male_count: 1, female_count: 1, amount: 160 });
  });

  it("点名退的资源不是这个性别 / 不在这一单上 / 同一张选两次 → 拦住", async () => {
    expect((await post(drop(["female", "s-m"]))).status).toBe(400);
    expect((await post(drop(["male", "s-m2"]))).status).toBe(400);
    seed({
      orders: [{ id: "o1", demand_days: ["2026-11-21"], male_count: 2, female_count: 1, amount: 300, status: "created" }],
    });
    expect((await post(drop(["male", "s-m"], ["male", "s-m"]))).status).toBe(400);
    expect(assigned()).toEqual(["s-f", "s-m"]);
    expect(order()).toMatchObject({ male_count: 2, female_count: 1, amount: 300 });
  });

  it("一个人都不剩不行；少的比有的多也不行", async () => {
    expect((await post(drop(["male", "s-m"], ["female", "s-f"]))).status).toBe(400);
    expect((await post(drop(["male", "s-m"], ["male", null]))).status).toBe(400);
    expect(assigned()).toEqual(["s-f", "s-m"]);
    expect(order()).toMatchObject({ male_count: 1, female_count: 1, amount: 160 });
  });

  it("坏输入 → 400", async () => {
    expect((await post("不是 json")).status).toBe(400);
    expect((await post({ drops: [{ gender: "male" }] })).status).toBe(400);
    expect((await post({ order_id: "o1" })).status).toBe(400);
    expect((await post({ order_id: "o1", drops: [] })).status).toBe(400);
    expect((await post(drop(["x", null]))).status).toBe(400);
    expect((await post({ ...drop(["male", "s-m"]), order_id: "没这单" })).status).toBe(400);
  });

  it("人工推进过的状态（待付款）不动", async () => {
    order().status = "pendingPayment";
    await post(drop(["male", "s-m"]));
    expect(order().status).toBe("pendingPayment");
  });
});

describe("菜单列哪几个人", () => {
  const cards = [
    { id: "s-m", label: "Evan", gender: "male" },
    { id: "s-m2", label: "James", gender: "male" },
    { id: "s-f", label: "Elaine", gender: "female" },
  ];
  it("配了资源的一个资源一个人，没分配的每人一项；只剩一个人就空", () => {
    expect(dropPersonOptions(2, 1, cards).map((o) => o.resourceId)).toEqual(["s-m", "s-m2", "s-f"]);
    expect(dropPersonOptions(3, 1, [cards[0]]).map((o) => [o.gender, o.resourceId])).toEqual([
      ["male", "s-m"],
      ["male", null],
      ["male", null],
      ["female", null],
    ]);
    expect(new Set(dropPersonOptions(3, 1, [cards[0]]).map((o) => o.key)).size).toBe(4);
    expect(dropPersonOptions(1, 0, [cards[0]])).toEqual([]);
  });
});
