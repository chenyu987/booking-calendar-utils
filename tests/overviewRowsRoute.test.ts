import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览实时更新：只拉变了的那几行。盯的是「问了却没回来 = 没了」这条 ——
// 删掉的单、挪出这季的单、被删的资源要让浏览器知道去掉，不然日历上留着一个幽灵色块。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  vi.resetModules();
  fake = createFakeSupabase({
    people: [{ id: "r1", chat_name: "天" }],
    customers: [{ id: "r1" }],
    orders: [
      { id: "o1", customer_id: "r1", demand_days: ["2026-12-01"], amount: 90, status: "created" },
      // 往年的单：不在 26-27 季里
      { id: "old", customer_id: "r1", demand_days: ["2025-12-01"], amount: 40, status: "complete" },
    ],
    order_assignments: [{ id: "a1", order_id: "o1", resource_id: "s1" }],
    resources: [
      { id: "s1", holder_name: "Evan", deleted_at: null },
      { id: "s2", holder_name: "Gone", deleted_at: "2026-11-01T00:00:00Z" },
    ],
    order_notes: [{ order_id: "o1", internal_note: "备注" }],
    day_notes: [{ day: "2026-12-01", note: "大雨" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/rows/route");
  const res = await POST(
    new Request("http://test/admin/overview/rows", { method: "POST", body: JSON.stringify(body) }) as any
  );
  return { status: res.status, json: await res.json() };
}

describe("只拉变了的那几行", () => {
  it("拉回这一单（带分配和客人）；问了却没有的、不在这季的 → row: null", async () => {
    const r = await post({ season: "26-27-na", orders: ["o1", "deleted", "old"] });
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.json.orders.map((o: any) => [o.id, o.row]));
    expect(byId.o1).toMatchObject({ id: "o1", amount: 90, order_assignments: [{ resource_id: "s1" }] });
    expect(byId.o1.customers).toMatchObject({ chat_name: "天" });
    expect(byId.deleted).toBeNull();
    expect(byId.old).toBeNull();
  });

  it("人改了名字：拉回他这季的单", async () => {
    const r = await post({ season: "26-27-na", customers: ["r1"] });
    expect(r.json.orders.map((o: any) => o.id)).toEqual(["o1"]);
  });

  it("资源：删掉的（deleted_at）当没了；备注和每天备注照拉", async () => {
    const r = await post({ season: "26-27-na", resources: ["s1", "s2"], notes: ["o1"], dayNotes: true });
    expect(r.json.resources).toEqual([
      { id: "s1", row: expect.objectContaining({ holder_name: "Evan" }) },
      { id: "s2", row: null },
    ]);
    expect(r.json.orderNotes).toEqual([{ order_id: "o1", internal_note: "备注" }]);
    expect(r.json.dayNotes).toEqual([{ day: "2026-12-01", note: "大雨" }]);
  });

  it("坏参数 → 400", async () => {
    expect((await post({ orders: "o1" })).status).toBe(400);
    expect((await post({ orders: [1] })).status).toBe(400);
  });
});
