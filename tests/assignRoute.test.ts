import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";

// 分配 / 撤销分配这条 Route Handler 的集成测试。
//
// 盯的是 CLAUDE.md 里那句「服务端必须校验，不能只靠界面藏按钮」。这一批用例
// 有一半是真出过的事故：拖拽分配上线那天，越配一张和重复配同一张都能配进去，
// 因为原来只有界面在拦。
//
// 不连真库（见 fakeSupabase.ts 里的说明）：这里要验的是校验逻辑，跟 Postgres
// 怎么存无关，而且要在每个 PR 上跑，不能碰线上数据。

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
      {
        id: "o1",
        demand_days: ["2026-09-10", "2026-09-11"],
        male_count: 1,
        female_count: 0,
        status: "created",
        location: "locbl",
      },
    ],
    resources: [
      {
        id: "s-male",
        holder_name: "阿男",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        validity: [{ start: "2026-06-01", end: "2027-05-01" }],
      },
      {
        id: "s-male2",
        holder_name: "阿男二",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        validity: [{ start: "2026-06-01", end: "2027-05-01" }],
      },
      {
        id: "s-expired",
        holder_name: "过期资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        validity: [{ start: "2026-06-01", end: "2026-07-01" }],
      },
      {
        id: "s-open",
        holder_name: "不限期资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        // 有效期两头都留空 = 不设限（整季通用的资源）
        validity: [{ start: null, end: null }],
      },
      {
        id: "s-from-only",
        holder_name: "只填了开始日",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        validity: [{ start: "2026-09-11", end: null }],
      },
      {
        id: "s-deleted",
        holder_name: "物主删掉的",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        validity: [{ start: "2026-06-01", end: "2027-05-01" }],
        // 软删除：行还在库里，但不该再配出去（迁移 0013）
        deleted_at: "2026-09-14T00:00:00Z",
      },
      {
        id: "s-paused",
        holder_name: "下架资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "paused",
        validity: [{ start: "2026-06-01", end: "2027-05-01" }],
      },
    ],
    order_assignments: [],
    ...overrides,
  };
  fake = createFakeSupabase(base);
  (globalThis as any).__fakeSupabase = fake.client;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/assign/route");
  const req = new Request("http://test/admin/overview/assign", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const assignments = () => fake.db.order_assignments;

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("分配：坏输入", () => {
  it("body 不是 JSON → 400，不是 500", async () => {
    const r = await post("这不是 json");
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("JSON");
  });

  it("缺参数 → 400", async () => {
    expect((await post({ order_id: "o1" })).status).toBe(400);
    expect((await post({ resource_id: "s-male" })).status).toBe(400);
  });

  it("订单或资源不存在 → 400，不炸", async () => {
    const r = await post({ order_id: "没这单", resource_id: "s-male" });
    expect(r.status).toBe(400);
    expect(assignments()).toHaveLength(0);
  });
});

describe("分配：三条校验（服务端拦，不是界面拦）", () => {
  it("挂牌状态不是 active 的配不上", async () => {
    const r = await post({ order_id: "o1", resource_id: "s-paused" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("不在出租中");
    expect(assignments()).toHaveLength(0);
  });

  it("物主删掉的资源配不上 —— 挂牌状态还是 active 也不行", async () => {
    const r = await post({ order_id: "o1", resource_id: "s-deleted" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("删掉了");
    expect(assignments()).toHaveLength(0);
  });

  it("有效期盖不住订单那几天的配不上", async () => {
    const r = await post({ order_id: "o1", resource_id: "s-expired" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("覆盖不了");
    expect(assignments()).toHaveLength(0);
  });

  it("有效期两头都留空的资源，什么日子都配得上", async () => {
    const r = await post({ order_id: "o1", resource_id: "s-open" });
    expect(r.status).toBe(200);
    expect(assignments()).toHaveLength(1);
  });

  it("只填了开始日的资源，订单有一天在它之前照样拦住", async () => {
    // 这一单是 9/10~9/11，资源从 9/11 才生效 —— 结束日空着不代表整段都行
    const r = await post({ order_id: "o1", resource_id: "s-from-only" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("覆盖不了");
    expect(assignments()).toHaveLength(0);
  });

  it("同一个资源同一天不能配给两个订单", async () => {
    fake.db.orders.push({
      id: "o2",
      demand_days: ["2026-09-11", "2026-09-12"], // 跟 o1 的 9/11 撞了
      male_count: 1,
      female_count: 0,
      status: "created",
      location: "locbl",
    });
    fake.db.order_assignments.push({ id: "a1", order_id: "o2", resource_id: "s-male" });

    const r = await post({ order_id: "o1", resource_id: "s-male" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("2026-09-11");
    expect(assignments()).toHaveLength(1); // 还是原来那一条
  });
});

describe("分配：拖拽暴露出来的那两个洞", () => {
  it("这一单只要一张男资源，配第二张男资源要拦住", async () => {
    expect((await post({ order_id: "o1", resource_id: "s-male" })).status).toBe(200);

    const r = await post({ order_id: "o1", resource_id: "s-male2" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("配齐");
    expect(assignments()).toHaveLength(1);
  });

  it("同一个资源配给同一单两次要拦住", async () => {
    expect((await post({ order_id: "o1", resource_id: "s-male" })).status).toBe(200);

    const r = await post({ order_id: "o1", resource_id: "s-male" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("已经配给这一单了");
    expect(assignments()).toHaveLength(1);
  });
});

describe("分配：配齐了才推进状态", () => {
  it("1男1女的单只配上男资源，状态还是 created", async () => {
    fake.db.orders[0].female_count = 1;

    expect((await post({ order_id: "o1", resource_id: "s-male" })).status).toBe(200);
    expect(fake.db.orders[0].status).toBe("created");
  });

  it("配齐了才推进到 itemAssigned", async () => {
    await post({ order_id: "o1", resource_id: "s-male" });
    expect(fake.db.orders[0].status).toBe("itemAssigned");
  });

  it("撤掉一张之后状态退回 created", async () => {
    await post({ order_id: "o1", resource_id: "s-male" });
    expect(fake.db.orders[0].status).toBe("itemAssigned");

    const r = await post({ order_id: "o1", resource_id: "s-male", op: "remove" });
    expect(r.status).toBe(200);
    expect(assignments()).toHaveLength(0);
    expect(fake.db.orders[0].status).toBe("created");
  });
});

describe("分配：库写失败", () => {
  it("插入失败要如实返回错误，不能装作配上了", async () => {
    fake.failNextWriteWith("连接断了");
    const r = await post({ order_id: "o1", resource_id: "s-male" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("连接断了");
    expect(fake.db.orders[0].status).toBe("created");
  });
});
