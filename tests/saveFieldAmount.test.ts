import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";
import { collectChangedEdits } from "@/app/admin/overview/editorFields";

// 排期总览色块里改男女人数：总价跟着按比例变（每人每天的价钱不变），
// 同一次手动改了金额的以手填的为准。服务端（save-field）和退出编辑框时当场算的那份（editorFields）都盯着。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
function seed(amount: number | null = 80) {
  fake = createFakeSupabase({
    // 2 天 × 1 人 × 40 = 80
    orders: [
      {
        id: "o1",
        customer_id: "p1",
        male_count: 1,
        female_count: 0,
        demand_days: ["2026-12-24", "2026-12-25"],
        amount,
      },
    ],
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

async function save(body: Record<string, unknown>) {
  const { POST } = await import("@/app/admin/overview/save-field/route");
  const res = await POST(
    new Request("http://test/admin/overview/save-field", {
      method: "POST",
      body: JSON.stringify({ order_id: "o1", ...body }),
    }) as any
  );
  return res.status;
}

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("save-field：改人数，总价跟着变", () => {
  it("1 人加到 2 人：80 → 160", async () => {
    expect(await save({ male_count: 1, female_count: 1 })).toBe(200);
    expect(fake.db.orders[0]).toMatchObject({ male_count: 1, female_count: 1, amount: 160 });
  });

  it("2 人减到 1 人：按比例减半", async () => {
    fake.db.orders[0].female_count = 1;
    fake.db.orders[0].amount = 160;
    expect(await save({ male_count: 0, female_count: 1 })).toBe(200);
    expect(fake.db.orders[0]).toMatchObject({ male_count: 0, female_count: 1, amount: 80 });
  });

  it("**同时手动改了金额：以手填的为准**", async () => {
    expect(await save({ male_count: 1, female_count: 1, amount: 150 })).toBe(200);
    expect(fake.db.orders[0]).toMatchObject({ male_count: 1, female_count: 1, amount: 150 });
  });

  it("原来没填金额：还是空着，不凭空算一个", async () => {
    seed(null);
    expect(await save({ male_count: 1, female_count: 1 })).toBe(200);
    expect(fake.db.orders[0].amount).toBeNull();
  });

  it("只改备注不碰金额", async () => {
    expect(await save({ note: "改个备注" })).toBe(200);
    expect(fake.db.orders[0].amount).toBe(80);
  });
});

// 编辑框的假 DOM：只要 querySelector 拿得到 value 和 data-original
function fakeEditor(fields: Record<string, { value: string; original: string }>) {
  return {
    querySelector(sel: string) {
      const name = /name="([^"]+)"/.exec(sel)?.[1];
      const f = name ? fields[name] : undefined;
      return f ? { value: f.value, dataset: { original: f.original } } : null;
    },
  } as unknown as Element;
}

describe("退出编辑框时当场算好新金额（色块不用等服务端就显示对的）", () => {
  it("改了人数、没动金额：送上去的是按比例算好的金额", () => {
    const changes = collectChangedEdits(
      fakeEditor({
        male_count: { value: "1", original: "1" },
        female_count: { value: "1", original: "0" },
        amount: { value: "80", original: "80" },
      })
    );
    expect(changes).toMatchObject({ male_count: "1", female_count: "1", amount: "160" });
  });

  it("人数和金额都改了：送手填的金额", () => {
    const changes = collectChangedEdits(
      fakeEditor({
        male_count: { value: "1", original: "1" },
        female_count: { value: "1", original: "0" },
        amount: { value: "150", original: "80" },
      })
    );
    expect(changes.amount).toBe("150");
  });

  it("金额本来是空的：不送金额", () => {
    const changes = collectChangedEdits(
      fakeEditor({
        male_count: { value: "2", original: "1" },
        female_count: { value: "0", original: "0" },
        amount: { value: "", original: "" },
      })
    );
    expect(changes.amount).toBeUndefined();
  });

  it("没改人数：不送金额", () => {
    const changes = collectChangedEdits(
      fakeEditor({
        male_count: { value: "1", original: "1" },
        female_count: { value: "0", original: "0" },
        amount: { value: "80", original: "80" },
      })
    );
    expect(changes).toEqual({});
  });
});
