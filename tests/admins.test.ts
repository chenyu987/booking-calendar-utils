import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";
import {
  parseAdminIds,
  contactsDiff,
  parseAdminName,
  matchesContactFilter,
  resolveAdmin,
  CONTACT_FILTER_NONE,
} from "@/lib/admins";

// 管理员 + 「这个客人是谁的」（迁移 0018）。每个管理员对应一个加客人用的账号。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
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
function seed(tables = {}) {
  fake = createFakeSupabase({ admins: ADMINS, person_contacts: [], ...tables });
  (globalThis as any).__fakeSupabase = fake.client;
}

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("表单里勾的管理员", () => {
  it("认得的照收，重复的只算一次", () => {
    expect(parseAdminIds(["a-admin2", "a-admin1", "a-admin2"], ADMINS)).toEqual({
      ok: true,
      ids: ["a-admin2", "a-admin1"],
    });
  });

  it("一个都不勾 = 还没标，合法", () => {
    expect(parseAdminIds([], ADMINS)).toEqual({ ok: true, ids: [] });
  });

  it("**认不出来的 id 整个拒掉，不悄悄丢掉**", () => {
    // 悄悄丢掉的话，这个人原来挂的管理员会被当成「取消勾选」删掉
    expect(parseAdminIds(["a-admin1", "a-gone"], ADMINS).ok).toBe(false);
  });
});

describe("改「谁的客人」只动有变化的", () => {
  it("算出要加的和要删的", () => {
    expect(contactsDiff(["a-admin1"], ["a-admin2"])).toEqual({ add: ["a-admin2"], remove: ["a-admin1"] });
    expect(contactsDiff(["a-admin1"], ["a-admin1", "a-admin2"])).toEqual({ add: ["a-admin2"], remove: [] });
    expect(contactsDiff(["a-admin1"], ["a-admin1"])).toEqual({ add: [], remove: [] });
  });

  it("**没变的那条不删不插** —— 全删再全插的话中间一步失败就全没了", async () => {
    seed({ person_contacts: [{ person_id: "p1", admin_id: "a-admin1" }] });
    const { saveContacts } = await import("@/lib/personContacts");
    await saveContacts("p1", ["a-admin1", "a-admin2"]);
    expect(fake.db.person_contacts.map((r: any) => r.admin_id).sort()).toEqual(["a-admin1", "a-admin2"]);
    expect(fake.writes.filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("取消勾选只删那一条，别人的不碰", async () => {
    seed({
      person_contacts: [
        { person_id: "p1", admin_id: "a-admin1" },
        { person_id: "p1", admin_id: "a-admin2" },
        { person_id: "p2", admin_id: "a-admin2" },
      ],
    });
    const { saveContacts } = await import("@/lib/personContacts");
    await saveContacts("p1", ["a-admin1"]);
    expect(fake.db.person_contacts).toEqual([
      { person_id: "p1", admin_id: "a-admin1" },
      { person_id: "p2", admin_id: "a-admin2" },
    ]);
  });
});

describe("列表按管理员筛", () => {
  it("空 = 不筛；某个人 = 挂了这个人的；还没标 = 一个都没挂的", () => {
    expect(matchesContactFilter([], "")).toBe(true);
    expect(matchesContactFilter(["a-admin2"], "a-admin2")).toBe(true);
    expect(matchesContactFilter(["a-admin1"], "a-admin2")).toBe(false);
    // 两个都加了的人，筛哪个都在
    expect(matchesContactFilter(["a-admin1", "a-admin2"], "a-admin1")).toBe(true);
    expect(matchesContactFilter([], CONTACT_FILTER_NONE)).toBe(true);
    expect(matchesContactFilter(["a-admin2"], CONTACT_FILTER_NONE)).toBe(false);
  });
});

describe("加管理员 / 改名的接口", () => {
  async function post(body: unknown) {
    const { POST } = await import("@/app/admin/admins/route");
    const res = await POST(
      new Request("http://test/admin/admins", {
        method: "POST",
        body: JSON.stringify(body),
      }) as any
    );
    return { status: res.status, json: await res.json() };
  }

  it("加一个，返回最新的列表", async () => {
    const r = await post({ name: "  小王 " });
    expect(r.status).toBe(200);
    expect(fake.db.admins.map((a: any) => a.name)).toContain("小王");
    expect(r.json.admins.map((a: any) => a.name)).toContain("小王");
  });

  it("改名", async () => {
    const r = await post({ id: "a-admin2", name: "Admin2 Z" });
    expect(r.status).toBe(200);
    expect(fake.db.admins.find((a: any) => a.id === "a-admin2").name).toBe("Admin2 Z");
  });

  it("**重名拒掉**（不分大小写），一个都不写", async () => {
    const r = await post({ name: "admin1" });
    expect(r.status).toBe(400);
    expect(fake.db.admins).toHaveLength(2);
  });

  it("改名改成别人的名字也拒掉", async () => {
    expect((await post({ id: "a-admin2", name: "Admin1" })).status).toBe(400);
    expect(fake.db.admins.find((a: any) => a.id === "a-admin2").name).toBe("admin2");
  });

  it("空名字、太长的名字拒掉", async () => {
    expect((await post({ name: "   " })).status).toBe(400);
    expect((await post({ name: "一".repeat(21) })).status).toBe(400);
    expect(parseAdminName("一".repeat(20)).ok).toBe(true);
  });

  it("改一个不存在的管理员拒掉，不会凭空建一个", async () => {
    expect((await post({ id: "a-gone", name: "随便" })).status).toBe(400);
    expect(fake.db.admins).toHaveLength(2);
  });
});

describe("排期总览建单：把当前管理员补上", () => {
  it("新客人：记成当前管理员的", async () => {
    const { addContact } = await import("@/lib/personContacts");
    await addContact("p1", "a-admin1");
    expect(fake.db.person_contacts).toEqual([expect.objectContaining({ person_id: "p1", admin_id: "a-admin1" })]);
  });

  it("**老客人原来是 admin2 加的，Admin1 建单 → 补上 Admin1，admin2 保留**", async () => {
    seed({ person_contacts: [{ person_id: "p1", admin_id: "a-admin2" }] });
    const { addContact } = await import("@/lib/personContacts");
    await addContact("p1", "a-admin1");
    expect(fake.db.person_contacts.map((r: any) => r.admin_id).sort()).toEqual(["a-admin1", "a-admin2"]);
  });

  it("已经是这个管理员的客人：不重复插", async () => {
    seed({ person_contacts: [{ person_id: "p1", admin_id: "a-admin1" }] });
    const { addContact } = await import("@/lib/personContacts");
    await addContact("p1", "a-admin1");
    expect(fake.db.person_contacts).toHaveLength(1);
  });
});

describe("当前身份（cookie）认谁", () => {
  it("cookie 里的 id 对上一个管理员就是他", () => {
    expect(resolveAdmin("a-admin2", ADMINS)).toMatchObject({ name: "admin2" });
  });

  it("没选过、或者那个管理员不在了，都当没选 —— 不能拿一个不存在的 id 去记归属", () => {
    expect(resolveAdmin(undefined, ADMINS)).toBeNull();
    expect(resolveAdmin("a-gone", ADMINS)).toBeNull();
  });
});

describe("排期总览按「这一单是哪个管理员的」筛", () => {
  it("URL 里的值：认得的管理员 id、none 照收，别的一律当没筛", async () => {
    const { parseOrderAdminFilter } = await import("@/lib/admins");
    expect(parseOrderAdminFilter("a-admin1", ADMINS)).toBe("a-admin1");
    expect(parseOrderAdminFilter(CONTACT_FILTER_NONE, ADMINS)).toBe(CONTACT_FILTER_NONE);
    // URL 是人能随手改的：乱写的、已经不存在的管理员，都当没筛，不报错
    expect(parseOrderAdminFilter("a-gone", ADMINS)).toBe("");
    expect(parseOrderAdminFilter(undefined, ADMINS)).toBe("");
  });

  it("筛某个人只留他的单；筛「没标」只留没有归属的（以前的单、客户自己发的）", async () => {
    const { matchesOrderAdmin } = await import("@/lib/admins");
    expect(matchesOrderAdmin("a-admin1", "")).toBe(true);
    expect(matchesOrderAdmin(null, "")).toBe(true);
    expect(matchesOrderAdmin("a-admin1", "a-admin1")).toBe(true);
    expect(matchesOrderAdmin("a-admin2", "a-admin1")).toBe(false);
    expect(matchesOrderAdmin(null, "a-admin1")).toBe(false);
    expect(matchesOrderAdmin(null, CONTACT_FILTER_NONE)).toBe(true);
    expect(matchesOrderAdmin(undefined, CONTACT_FILTER_NONE)).toBe(true);
    expect(matchesOrderAdmin("a-admin1", CONTACT_FILTER_NONE)).toBe(false);
  });
});
