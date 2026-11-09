import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "./fakeSupabase";

// Resource 管理：编辑那一行的「保存」（app/admin/resources/actions.ts 的 saveResource）
// 和排期浮层点开时拿明细的 /admin/resources/bookings。
// 编辑态改成在浏览器里切之后，保存不再 redirect，出错要把话带回那一行 —— 这里盯的是
// 「错的不写库」和「删了的资源改不了」（界面上删了的资源只给恢复，curl 绕得过去）。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  fake = createFakeSupabase({
    resources: [
      { id: "s-1", provider_id: "o-1", item_type: "alpha", holder_name: "old", status: "active", deleted_at: null },
      { id: "s-gone", provider_id: "o-1", item_type: "alpha", holder_name: "gone", status: "active", deleted_at: "2026-11-01T00:00:00Z" },
    ],
    order_assignments: [
      { id: "a1", resource_id: "s-1", order_id: "o-b" },
      { id: "a2", resource_id: "s-1", order_id: "o-a" },
      { id: "a3", resource_id: "s-other", order_id: "o-c" },
    ],
    orders: [
      { id: "o-a", demand_days: ["2025-01-03"], location: "locaa", status: "completed", customer_id: "r-1" },
      { id: "o-b", demand_days: ["2026-12-20"], location: "locaf", status: "itemAssigned", customer_id: "r-1" },
      { id: "o-c", demand_days: ["2026-12-21"], location: "x", status: "created", customer_id: "r-1" },
    ],
    customers: [{ id: "r-1" }],
    people: [{ id: "r-1", chat_name: "小王" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const base = {
  id: "s-1",
  provider_id: "o-2",
  item_type: "alpha",
  holder_name: "  New Name ",
  holder_gender: "female",
  holder_date_of_birth: "1999-01-02",
  date_range_start: "2026-11-01",
  date_range_end: "2027-05-30",
  status: "paused",
};
const row = (id: string) => fake.db.resources.find((s: any) => s.id === id);

describe("saveResource", () => {
  it("存进去，不跳页（返回空对象）", async () => {
    const { saveResource } = await import("@/app/admin/resources/actions");
    expect(await saveResource(form(base))).toEqual({});
    expect(row("s-1")).toMatchObject({ provider_id: "o-2", holder_name: "New Name", holder_gender: "female", status: "paused" });
  });

  it("有效期结束早于开始：把话带回来，不写库", async () => {
    const { saveResource } = await import("@/app/admin/resources/actions");
    const r = await saveResource(form({ ...base, date_range_start: "2027-05-30", date_range_end: "2026-11-01" }));
    expect(r.error).toMatch(/有效期/);
    expect(row("s-1").holder_name).toBe("old");
    expect(fake.writes.filter((w) => w.op === "update")).toEqual([]);
  });

  it("挂牌状态不是那三种之一：不写库", async () => {
    const { saveResource } = await import("@/app/admin/resources/actions");
    expect((await saveResource(form({ ...base, status: "hacked" }))).error).toBeTruthy();
    expect(row("s-1").status).toBe("active");
  });

  it("删了的资源改不了", async () => {
    const { saveResource } = await import("@/app/admin/resources/actions");
    const r = await saveResource(form({ ...base, id: "s-gone" }));
    expect(r.error).toBeTruthy();
    expect(row("s-gone").holder_name).toBe("gone");
  });
});

describe("/admin/resources/bookings", () => {
  const get = async (id: string | null) => {
    const { GET } = await import("@/app/admin/resources/bookings/route");
    const url = new URL("http://x/admin/resources/bookings");
    if (id) url.searchParams.set("id", id);
    return GET(new NextRequest(url));
  };

  // 客户名怎么显示在 lib/resourceBookings.test.ts 里测：假库只认一层嵌套，
  // order_assignments → orders → customers 两层的摊平它做不到
  it("只给这个资源的单，按日子排好", async () => {
    const res = await get("s-1");
    expect(res.status).toBe(200);
    const { rows } = await res.json();
    expect(rows.map((r: any) => r.id)).toEqual(["o-a", "o-b"]);
    expect(rows[1]).toMatchObject({ location: "locaf" });
  });

  it("没给 id：400", async () => {
    expect((await get(null)).status).toBe(400);
  });
});
