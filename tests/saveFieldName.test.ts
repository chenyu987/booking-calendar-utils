import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览色块里直接改客人名字（/admin/overview/save-field）。
// 色块上显示的是 displayName（昵称优先，没有昵称退回称呼）—— 改的必须是显示的那一列，
// 不然改的是一列、显示的是另一列，存完色块上的名字纹丝不动。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
function seed(person: Record<string, unknown>) {
  fake = createFakeSupabase({
    orders: [{ id: "o1", customer_id: "p1" }],
    customers: [{ id: "p1" }],
    people: [{ id: "p1", ...person }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

async function rename(name: string) {
  const { POST } = await import("@/app/admin/overview/save-field/route");
  const res = await POST(
    new Request("http://test/admin/overview/save-field", {
      method: "POST",
      body: JSON.stringify({ order_id: "o1", customer_name: name }),
    }) as any
  );
  return res.status;
}

beforeEach(() => vi.resetModules());

describe("色块里改客人名字", () => {
  it("没有称呼（导入的人）：改昵称", async () => {
    seed({ chat_name: "小雨" });
    expect(await rename("小雨2")).toBe(200);
    expect(fake.db.people[0]).toMatchObject({ chat_name: "小雨2" });
    expect(fake.db.people[0].first_name).toBeUndefined();
  });

  it("**有昵称也有称呼：改昵称，不动称呼** —— 色块上显示的是昵称", async () => {
    seed({ first_name: "Amy", chat_name: "小雨" });
    expect(await rename("小雨2")).toBe(200);
    expect(fake.db.people[0]).toMatchObject({ chat_name: "小雨2", first_name: "Amy" });
  });

  it("**没有昵称、只有称呼（自己注册、还没加好友的）：改称呼** —— 色块上显示的是称呼", async () => {
    seed({ first_name: "Zoey", last_name: "Lee" });
    expect(await rename("Zoe L")).toBe(200);
    // 显示的是「名 + 姓」，改完整串进 first_name、姓清掉，不然姓会再拼一遍
    expect(fake.db.people[0]).toMatchObject({ first_name: "Zoe L", last_name: null });
    expect(fake.db.people[0].chat_name).toBeUndefined();
  });
});
