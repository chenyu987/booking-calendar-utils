import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览分配浮动条上改「这一单是谁的」（/admin/overview/save-field 的 admin_id）。
// 认不出来的管理员整个拒掉，而且同一个请求里的别的字段也一个都不写 —— 拦在写库之前。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  vi.resetModules();
  fake = createFakeSupabase({
    admins: [
      { id: "a-admin1", name: "Admin1" },
      { id: "a-admin2", name: "admin2" },
    ],
    orders: [{ id: "o1", admin_id: "a-admin1", location: "locaa" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/admin/overview/save-field/route");
  const res = await POST(
    new Request("http://test/admin/overview/save-field", {
      method: "POST",
      body: JSON.stringify({ order_id: "o1", ...body }),
    }) as any
  );
  return res.status;
}

describe("分配浮动条上改是谁的单", () => {
  it("Admin1 的单改成 admin2 的", async () => {
    expect(await post({ admin_id: "a-admin2" })).toBe(200);
    expect(fake.db.orders[0].admin_id).toBe("a-admin2");
  });

  it("**没有这个管理员：拒掉，同一请求里的地点也不写**", async () => {
    expect(await post({ admin_id: "a-ghost", location: "akaad" })).toBe(400);
    expect(fake.db.orders[0]).toMatchObject({ admin_id: "a-admin1", location: "locaa" });
  });

  it("空串 / 不是字符串：拒掉，不当成「清空」", async () => {
    expect(await post({ admin_id: "" })).toBe(400);
    expect(await post({ admin_id: 3 })).toBe(400);
    expect(fake.db.orders[0].admin_id).toBe("a-admin1");
  });

  it("没带 admin_id 的保存不碰它", async () => {
    expect(await post({ location: "akaad" })).toBe(200);
    expect(fake.db.orders[0]).toMatchObject({ admin_id: "a-admin1", location: "akaad" });
  });
});
