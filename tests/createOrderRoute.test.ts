import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览拖空白建单（create-order，原来是 Server Action createQuickOrder）。
// 盯的是服务端那几道：没选身份不建、坏日期不建（拦在任何写库之前）；同名客户复用不另起一个人。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));
let admin: string | null = "admin1";
vi.mock("@/lib/adminSession", () => ({ currentAdminId: async () => admin }));

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  vi.resetModules();
  admin = "admin1";
  fake = createFakeSupabase({
    admins: [{ id: "admin1" }],
    people: [{ id: "r1", chat_name: "天" }],
    customers: [{ id: "r1" }],
    orders: [],
    order_notes: [],
    person_contacts: [],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/create-order/route");
  const res = await POST(
    new Request("http://test/admin/overview/create-order", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as any
  );
  return { status: res.status, json: await res.json() };
}

const ok = { customer_name: "天", location: "locaj", male_count: 1, female_count: 1, demand_days: ["2026-12-01"], amount: "90", note: "" };

describe("拖空白建单", () => {
  // 「同名客户复用」靠的是 customers → people!inner 上的 ilike，内存假库不认这种跨表筛选，这里不测（逻辑跟原来的
  // Server Action 一字没改）。这条只看建出来的单子对不对、客人记到了当前身份名下
  it("建出来的单：记在当前身份名下、created、客人补到当前身份名下", async () => {
    const r = await post(ok);
    expect(r.status).toBe(200);
    expect(fake.db.orders).toHaveLength(1);
    const o = fake.db.orders[0];
    expect(o).toMatchObject({ admin_id: "admin1", amount: 90, status: "created", demand_days: ["2026-12-01"] });
    expect(fake.db.person_contacts).toEqual([expect.objectContaining({ person_id: o.customer_id, admin_id: "admin1" })]);
  });

  it("填了备注才写备注", async () => {
    const r = await post({ ...ok, note: "要女资源" });
    expect(fake.db.order_notes).toEqual([expect.objectContaining({ order_id: r.json.id, internal_note: "要女资源" })]);
  });

  it("没选身份 / 身份不在库里 → 拦住，一个字都不写", async () => {
    admin = null;
    expect((await post(ok)).status).toBe(400);
    admin = "谁";
    expect((await post(ok)).status).toBe(400);
    expect(fake.db.orders).toHaveLength(0);
    expect(fake.db.person_contacts).toHaveLength(0);
  });

  it("坏输入 → 400，不写库", async () => {
    expect((await post({ ...ok, customer_name: " " })).status).toBe(400);
    expect((await post({ ...ok, demand_days: [] })).status).toBe(400);
    expect((await post({ ...ok, demand_days: ["12/1"] })).status).toBe(400);
    expect((await post({ ...ok, amount: "abc" })).status).toBe(400);
    expect((await post("不是 json")).status).toBe(400);
    expect(fake.db.orders).toHaveLength(0);
  });
});
