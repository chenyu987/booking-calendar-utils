import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase, type Tables } from "./fakeSupabase";

// 拖日期改天数这条 Route Handler。
//
// 重点盯「同一个资源同一天不能配给两个订单」—— 这条以前只拦分配那条路，拖日期
// 这条完全没拦，把配好资源的单子往前拖一天撞上同一个资源在别单的日子就写进库了。
// 那种数据两条分配路径都造不出来，只能靠人肉发现。

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
      // 被拖的这一单：9/12~9/13
      { id: "o-drag", demand_days: ["2026-09-12", "2026-09-13"], amount: 80 },
      // 前面那一单：9/10~9/11，用的是同一个资源
      { id: "o-earlier", demand_days: ["2026-09-10", "2026-09-11"], amount: 140 },
    ],
    resources: [{ id: "s-sara", holder_name: "sara lee" }],
    order_assignments: [
      { id: "a1", order_id: "o-drag", resource_id: "s-sara" },
      { id: "a2", order_id: "o-earlier", resource_id: "s-sara" },
    ],
    ...overrides,
  };
  fake = createFakeSupabase(base);
  (globalThis as any).__fakeSupabase = fake.client;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/admin/overview/resize/route");
  const req = new Request("http://test/admin/overview/resize", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const days = () => fake.db.orders.find((o: any) => o.id === "o-drag")!.demand_days;

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("往前拖会撞上同一个资源在别单的日子", () => {
  it("拦住，并说清是哪个资源、哪一天", async () => {
    const r = await post({
      order_id: "o-drag",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-11", // 撞上 o-earlier
      new_end: "2026-09-13",
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("sara lee");
    expect(r.json.error).toContain("2026-09-11");
  });

  it("**拦住就一天都不许写进去**（半改半不改最难查）", async () => {
    await post({
      order_id: "o-drag",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-11",
      new_end: "2026-09-13",
    });
    expect(days()).toEqual(["2026-09-12", "2026-09-13"]);
  });
});

describe("不撞的照常改", () => {
  it("往后拖一天：日期变了，总价按天数比例重算", async () => {
    const r = await post({
      order_id: "o-drag",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-12",
      new_end: "2026-09-14",
    });
    expect(r.status).toBe(200);
    expect(days()).toEqual(["2026-09-12", "2026-09-13", "2026-09-14"]);
    // 原来 2 天 80 → 单价 40 → 3 天 120
    expect(fake.db.orders.find((o: any) => o.id === "o-drag")!.amount).toBe(120);
  });

  it("没分配的单子随便拖 —— 没有资源就谈不上撞", async () => {
    seed({ order_assignments: [{ id: "a2", order_id: "o-earlier", resource_id: "s-sara" }] });
    const r = await post({
      order_id: "o-drag",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-11",
      new_end: "2026-09-13",
    });
    expect(r.status).toBe(200);
    expect(days()).toContain("2026-09-11");
  });

  it("撞的是**自己**的日子不算（同一单本来就占着那几天）", async () => {
    seed({ order_assignments: [{ id: "a1", order_id: "o-drag", resource_id: "s-sara" }] });
    const r = await post({
      order_id: "o-drag",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-12",
      new_end: "2026-09-14",
    });
    expect(r.status).toBe(200);
  });
});

describe("坏输入", () => {
  it("body 不是 JSON / 参数不全 → 400", async () => {
    expect((await post("nope")).status).toBe(400);
    expect((await post({ order_id: "o-drag" })).status).toBe(400);
  });

  it("订单不存在 → 400，不炸", async () => {
    const r = await post({
      order_id: "没这单",
      run_start: "2026-09-12",
      run_end: "2026-09-13",
      new_start: "2026-09-12",
      new_end: "2026-09-14",
    });
    expect(r.status).toBe(400);
  });
});
