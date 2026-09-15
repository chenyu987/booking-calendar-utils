import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";

// 物主提意向这条 Route Handler 的集成测试。
//
// 这条路原来是 Server Action，没测试；改成 Route Handler 之后正好补上 ——
// 判断标准就是 CLAUDE.md 那句：**这条规则如果只写在界面上，有人直接 curl
// 能不能绕过去？** 这里每一条都能：界面上只画出「我的资源 + 接得了的单」，
// 可 POST 一个别人的 resource_id、一个已经配满的 order_id，服务端不拦就进库了。
//
// 意向变不成事实（真闸门在管理员把 match 改成 chosen 那一步），但垃圾意向会把
// 匹配台淹掉 —— 那是人要一条条清的。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

let fake: ReturnType<typeof createFakeSupabase>;
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

// 登录那一层不是这里要验的东西：认成谁由 __provider 决定，没登录返回 null
vi.mock("@/lib/supabaseServer", () => ({
  getSessionUser: async () =>
    (globalThis as any).__provider ? { id: "auth-1", email: "o@x.com" } : null,
}));
vi.mock("@/lib/accountClaim", () => ({
  claimProvider: async () => (globalThis as any).__provider,
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
      {
        id: "o-done",
        demand_days: ["2026-09-10"],
        male_count: 1,
        female_count: 0,
        // 已经配上资源了，不再找资源
        status: "itemAssigned",
        location: "locbl",
      },
    ],
    resources: [
      {
        id: "s-mine",
        provider_id: "me",
        holder_name: "我的资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        date_range_start: "2026-06-01",
        date_range_end: "2027-05-01",
      },
      {
        id: "s-theirs",
        provider_id: "someone-else",
        holder_name: "别人的资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        date_range_start: "2026-06-01",
        date_range_end: "2027-05-01",
      },
      {
        id: "s-expired",
        provider_id: "me",
        holder_name: "盖不住的资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        date_range_start: "2026-06-01",
        date_range_end: "2026-09-10", // 只盖得住第一天
      },
      {
        id: "s-deleted",
        provider_id: "me",
        holder_name: "我删掉的资源",
        holder_gender: "male",
        item_type: "alpha",
        status: "active",
        date_range_start: "2026-06-01",
        date_range_end: "2027-05-01",
        deleted_at: "2026-09-01T00:00:00Z",
      },
    ],
    order_assignments: [],
    matches: [],
    ...overrides,
  };
  fake = createFakeSupabase(base);
  (globalThis as any).__fakeSupabase = fake.client;
  (globalThis as any).__provider = "me";
}

async function post(body: unknown) {
  const { POST } = await import("@/app/provider/propose/route");
  const req = new Request("http://test/provider/propose", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const matches = () => fake.db.matches;

beforeEach(() => seed());

describe("POST /provider/propose", () => {
  it("正常提一条", async () => {
    const res = await post({ order_id: "o1", resource_id: "s-mine" });
    expect(res.status).toBe(200);
    expect(matches()).toHaveLength(1);
    expect(matches()[0]).toMatchObject({
      order_id: "o1",
      resource_id: "s-mine",
      status: "proposed",
    });
  });

  it("没登录不给提", async () => {
    (globalThis as any).__provider = null;
    const res = await post({ order_id: "o1", resource_id: "s-mine" });
    expect(res.status).toBe(401);
    expect(matches()).toHaveLength(0);
  });

  // **认 provider_id，不是只认 id。** 界面上只列自己的资源，但 resource_id 是从
  // 请求里来的，换一个就是别人的资源
  it("别人的资源不给提", async () => {
    const res = await post({ order_id: "o1", resource_id: "s-theirs" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(0);
  });

  // 这一条有两层拦着：查资源时 `.is("deleted_at", null)`，以及 assignBlockReason
  // 里「删掉的资源不能配」那一条。所以单独摘掉任何一层它都还是绿的 ——
  // 不是假测试（两层一起摘就红），但别拿它当「查询里那个过滤还在」的证据
  it("自己删掉的资源不给提", async () => {
    const res = await post({ order_id: "o1", resource_id: "s-deleted" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(0);
  });

  it("已经不找资源的单不给提", async () => {
    const res = await post({ order_id: "o-done", resource_id: "s-mine" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(0);
  });

  // 跟分配是同一套校验（lib/assignable.ts）：有效期要盖住订单的**全部**日期
  it("有效期盖不住那几天的不给提", async () => {
    const res = await post({ order_id: "o1", resource_id: "s-expired" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(0);
  });

  it("那几天这个资源已经排给别的单了，不给提", async () => {
    seed({
      orders: [
        {
          id: "o1",
          demand_days: ["2026-09-10", "2026-09-11"],
          male_count: 1,
          female_count: 0,
          status: "created",
          location: "locbl",
        },
        {
          id: "o2",
          demand_days: ["2026-09-11"],
          male_count: 1,
          female_count: 0,
          status: "itemAssigned",
          location: "locbl",
        },
      ],
      order_assignments: [{ order_id: "o2", resource_id: "s-mine" }],
    });
    const res = await post({ order_id: "o1", resource_id: "s-mine" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(0);
  });

  it("同一个资源对同一单提两次不给提 —— 只会把匹配台刷满", async () => {
    seed({ matches: [{ id: "m1", order_id: "o1", resource_id: "s-mine", status: "proposed" }] });
    const res = await post({ order_id: "o1", resource_id: "s-mine" });
    expect(res.status).toBe(400);
    expect(matches()).toHaveLength(1);
  });

  it("参数缺了或者 body 不是 JSON，都是 400 不是崩", async () => {
    expect((await post("不是 json")).status).toBe(400);
    expect((await post({ order_id: "o1" })).status).toBe(400);
    expect(matches()).toHaveLength(0);
  });
});
