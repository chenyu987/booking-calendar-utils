import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// Provider 管理的「谁的客人」（2026-10-30，照 Customer 管理那套，app/admin/providers/actions.ts）：
// - 认不出来的管理员 id 整个拒掉，**一个字都不写** —— 悄悄丢掉会被当成「取消勾选」把原来的删了
// - 编辑只加新勾的、只删取消勾的，别的管理员不碰

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

const ADMINS = [
  { id: "a-admin1", name: "Admin1", created_at: "1" },
  { id: "a-admin2", name: "admin2", created_at: "2" },
];

let fake: ReturnType<typeof createFakeSupabase>;
function seed(tables: Record<string, any[]> = {}) {
  fake = createFakeSupabase({
    admins: ADMINS,
    people: [{ id: "p1", chat_name: "老李", chat_id: "wx1", status: "active" }],
    providers: [{ id: "p1" }],
    customers: [],
    person_contacts: [],
    ...tables,
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

function form(fields: Record<string, string>, contacts: string[] = []) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  for (const c of contacts) f.append("contact", c);
  return f;
}

const adminsOf = (personId: string) =>
  fake.db.person_contacts
    .filter((r: any) => r.person_id === personId)
    .map((r: any) => r.admin_id)
    .sort();

beforeEach(() => vi.resetModules());

describe("createProvider", () => {
  const create = async (contacts: string[]) => {
    const { createProvider } = await import("@/app/admin/providers/actions");
    return createProvider(form({ chat_name: "新物主", chat_id: "wx-new" }, contacts)).catch((e: Error) => e.message);
  };

  it("勾了谁就记成谁的客人", async () => {
    seed();
    await create(["a-admin2"]);
    const created = fake.db.people.find((p: any) => p.chat_name === "新物主");
    expect(created).toBeTruthy();
    expect(adminsOf(created.id)).toEqual(["a-admin2"]);
  });

  it("**认不出来的管理员整个拒掉，人也不建**", async () => {
    seed();
    expect(await create(["a-admin1", "a-ghost"])).toMatch(/认不出来/);
    expect(fake.db.people).toHaveLength(1);
    expect(fake.db.person_contacts).toHaveLength(0);
  });
});

describe("updateProvider", () => {
  const update = async (contacts: string[]) => {
    const { updateProvider } = await import("@/app/admin/providers/actions");
    return updateProvider(form({ id: "p1", chat_name: "老李改", chat_id: "wx1", status: "active" }, contacts)).catch(
      (e: Error) => e.message
    );
  };

  it("存完回到筛过的列表（back 重新解析，不原样用）", async () => {
    seed();
    const { updateProvider } = await import("@/app/admin/providers/actions");
    const f = form({ id: "p1", chat_name: "老李", status: "active", back: "?status=active&next=https://evil.example" });
    expect(await updateProvider(f).catch((e: Error) => e.message)).toBe("REDIRECT:/admin/providers?status=active");
  });

  it("只加新勾的、只删取消勾的", async () => {
    seed({ person_contacts: [{ person_id: "p1", admin_id: "a-admin1" }] });
    expect(await update(["a-admin2"])).toBe("REDIRECT:/admin/providers");
    expect(adminsOf("p1")).toEqual(["a-admin2"]);
  });

  it("**认不出来的管理员整个拒掉，名字和归属都不动**", async () => {
    seed({ person_contacts: [{ person_id: "p1", admin_id: "a-admin1" }] });
    expect(await update(["a-ghost"])).toMatch(/认不出来/);
    expect(fake.db.people[0].chat_name).toBe("老李");
    expect(adminsOf("p1")).toEqual(["a-admin1"]);
  });
});
