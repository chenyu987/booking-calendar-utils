import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览复制 / 粘贴一单：抄客人、地点、人数、几天、总价；日子按库里的平移到贴的那天；
// 不抄分配、状态、备注；记在当前身份名下。没选身份、源单不在、坏参数一个字都不写。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
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
    admins: [{ id: "admin1" }, { id: "admin2" }],
    orders: [
      {
        id: "o1",
        customer_id: "r1",
        admin_id: "admin2",
        location: "locac",
        male_count: 1,
        female_count: 0,
        // 不连续：滑 26、27、29
        demand_days: ["2026-11-27", "2026-11-26", "2026-11-29"],
        amount: 135,
        status: "itemAssigned",
      },
    ],
    order_assignments: [{ id: "a1", order_id: "o1", resource_id: "s1" }],
    person_contacts: [],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/paste-order/route");
  const req = new Request("http://test/admin/overview/paste-order", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const pasted = () => fake.db.orders.filter((o: any) => o.id !== "o1");

describe("复制 / 粘贴一单", () => {
  it("贴到 12/3：抄客人地点人数总价，日子按原来的间隔平移；新单未分配、created、记当前身份", async () => {
    const r = await post({ from_order_id: "o1", start: "2026-12-03" });
    expect(r.status).toBe(200);
    expect(pasted()).toHaveLength(1);
    expect(pasted()[0]).toMatchObject({
      customer_id: "r1",
      admin_id: "admin1",
      location: "locac",
      male_count: 1,
      female_count: 0,
      demand_days: ["2026-12-03", "2026-12-04", "2026-12-06"],
      amount: 135,
      status: "created",
    });
    expect(fake.db.order_assignments).toHaveLength(1);
    // 客人补到当前身份名下
    expect(fake.db.person_contacts).toEqual([expect.objectContaining({ person_id: "r1", admin_id: "admin1" })]);
  });

  it("没选身份 / 身份不在库里 → 拦住，一个字都不写", async () => {
    admin = null;
    expect((await post({ from_order_id: "o1", start: "2026-12-03" })).status).toBe(400);
    admin = "谁";
    expect((await post({ from_order_id: "o1", start: "2026-12-03" })).status).toBe(400);
    expect(pasted()).toHaveLength(0);
    expect(fake.db.person_contacts).toHaveLength(0);
  });

  it("源单不在、坏参数 → 400", async () => {
    expect((await post({ from_order_id: "没这单", start: "2026-12-03" })).status).toBe(400);
    expect((await post({ from_order_id: "o1", start: "12/3" })).status).toBe(400);
    expect((await post({ from_order_id: "o1", start: "2026-13-45" })).status).toBe(400);
    expect((await post({ start: "2026-12-03" })).status).toBe(400);
    expect((await post("不是 json")).status).toBe(400);
    expect(pasted()).toHaveLength(0);
  });
});
