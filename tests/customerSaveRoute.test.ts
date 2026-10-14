import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// Customer 管理「保存」的后台入口（/admin/customers/save）。界面上点保存当场就画好了，
// 真正写库在这儿 —— 所以这里拦不住的东西，界面会先显示成「存好了」再撤回；
// 而这里**放过去**的东西就真进库了。客户端那份校验只是为了当场报错，不算数：
// 有人直接 POST 一样要拦，拦住时一个字都不写。

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
    people: [{ id: "p1", chat_name: "小雨", status: "active", note: null }],
    customers: [{ id: "p1" }],
    admins: [
      { id: "admin-admin1", name: "Admin1", created_at: "2026-10-01" },
      { id: "admin-admin2", name: "admin2", created_at: "2026-10-02" },
    ],
    person_contacts: [{ person_id: "p1", admin_id: "admin-admin2" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function save(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  const { POST } = await import("@/app/admin/customers/save/route");
  const res = await POST(new Request("http://test/admin/customers/save", { method: "POST", body: fd }) as any);
  return { status: res.status, body: await res.json() };
}

const VALID = { id: "p1", chat_name: "小雨2", status: "blacklisted", note: "爽约两次", contact: ["admin-admin1"] };

describe("Customer 后台保存", () => {
  it("正常存：人身上的字段写进 people，「谁的客人」只加新勾的、只删取消勾的", async () => {
    const r = await save(VALID);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(fake.db.people[0]).toMatchObject({ chat_name: "小雨2", status: "blacklisted", note: "爽约两次" });
    expect(fake.db.person_contacts.map((c: any) => [c.person_id, c.admin_id])).toEqual([["p1", "admin-admin1"]]);
  });

  it("**昵称空着：拒掉，一个字都不写**", async () => {
    const r = await save({ ...VALID, chat_name: "  " });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("昵称必填");
    expect(fake.db.people[0]).toMatchObject({ chat_name: "小雨", status: "active" });
    expect(fake.db.person_contacts).toEqual([{ person_id: "p1", admin_id: "admin-admin2" }]);
  });

  it("**状态不在白名单里：拒掉** —— 界面下拉框里没有，但 curl 能发", async () => {
    const r = await save({ ...VALID, status: "vip" });
    expect(r.status).toBe(400);
    expect(fake.db.people[0].status).toBe("active");
  });

  it("**「谁的客人」里有认不出的管理员：整个拒掉，原来的不动** —— 悄悄丢掉会被当成取消勾选", async () => {
    const r = await save({ ...VALID, contact: ["admin-admin1", "admin-ghost"] });
    expect(r.status).toBe(400);
    expect(fake.db.people[0].chat_name).toBe("小雨");
    expect(fake.db.person_contacts).toEqual([{ person_id: "p1", admin_id: "admin-admin2" }]);
  });

  it("缺 id：拒掉", async () => {
    const { id: _id, ...noId } = VALID;
    expect((await save(noId)).status).toBe(400);
  });
});
