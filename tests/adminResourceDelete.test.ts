import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";

// /admin/resources 的「删除」和「恢复」（app/admin/resources/actions.ts）。
//
// 重点盯**软删**：原来这里是真删，order_assignments 对 resources 是 on delete cascade，
// 删一个资源会连分配记录一起带走，订单却还挂着「已分配」。
// 还有「已经排出去的不给删」—— 界面上按钮不出现，但 curl 绕得过去。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// redirect 在 Next 里是抛一个特殊错误来中断的，这里照样抛，测试里接住看跳去哪
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

function seed(overrides: Tables = {}) {
  fake = createFakeSupabase({
    resources: [
      { id: "s-free", holder_name: "空资源", status: "active", deleted_at: null },
      { id: "s-booked", holder_name: "排过的资源", status: "active", deleted_at: null },
    ],
    orders: [{ id: "o1", demand_days: ["2026-09-12"], status: "itemAssigned" }],
    order_assignments: [{ id: "a1", order_id: "o1", resource_id: "s-booked" }],
    ...overrides,
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

function form(id: string) {
  const f = new FormData();
  f.set("id", id);
  return f;
}

const resource = (id: string) => fake.db.resources.find((s: any) => s.id === id);

async function actions() {
  return import("@/app/admin/resources/actions");
}

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("删除是软删", () => {
  it("行还在，只打上 deleted_at", async () => {
    const { deleteResource } = await actions();
    await deleteResource(form("s-free"));
    expect(resource("s-free")).toBeTruthy();
    expect(resource("s-free").deleted_at).toBeTruthy();
    expect(fake.writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("已经删过的再删一次，删除时间不变", async () => {
    seed({
      resources: [{ id: "s-free", status: "active", deleted_at: "2026-09-01T00:00:00Z" }],
    });
    const { deleteResource } = await actions();
    await deleteResource(form("s-free"));
    expect(resource("s-free").deleted_at).toBe("2026-09-01T00:00:00Z");
  });
});

describe("已经排出去的资源不给删", () => {
  it("拦住跳回页面带 error=booked，一个字都不写", async () => {
    const { deleteResource } = await actions();
    await expect(deleteResource(form("s-booked"))).rejects.toThrow("REDIRECT:/admin/resources?error=booked");
    expect(resource("s-booked").deleted_at).toBe(null);
    expect(fake.writes).toHaveLength(0);
  });

  it("分配记录和订单原封不动", async () => {
    const { deleteResource } = await actions();
    await deleteResource(form("s-booked")).catch(() => {});
    expect(fake.db.order_assignments).toHaveLength(1);
    expect(fake.db.orders[0].status).toBe("itemAssigned");
  });
});

describe("恢复", () => {
  it("把 deleted_at 清掉", async () => {
    seed({
      resources: [{ id: "s-free", status: "active", deleted_at: "2026-09-01T00:00:00Z" }],
    });
    const { restoreResource } = await actions();
    await restoreResource(form("s-free"));
    expect(resource("s-free").deleted_at).toBe(null);
  });

  it("删了再恢复，资源还是原来那张（同一行、别的字段不动）", async () => {
    const { deleteResource, restoreResource } = await actions();
    await deleteResource(form("s-free"));
    await restoreResource(form("s-free"));
    expect(resource("s-free")).toMatchObject({ id: "s-free", holder_name: "空资源", status: "active", deleted_at: null });
  });
});
