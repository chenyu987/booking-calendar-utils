import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 物主留聊天 + 对上老物主（照着客户那套，tests/customerChat.test.ts）三道服务端的门：
// - 改联系方式（app/provider/actions.ts 的 saveContact）：昵称和账号不齐不让存
// - 挂资源（app/provider/listing/actions.ts）：同上，不齐一行都不写，资源也不建
// - 合并老物主（app/admin/providers/actions.ts）：只许合页面上还提示着的那一对

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
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
vi.mock("@/lib/supabaseServer", () => ({
  getSessionUser: async () => ({ id: "auth-1", email: "me@example.com" }),
}));

let fake: ReturnType<typeof createFakeSupabase>;

function seed(me: Record<string, any> = {}) {
  fake = createFakeSupabase({
    people: [
      { id: "old", chat_name: "老李", chat_id: null, auth_user_id: null },
      { id: "other", chat_name: "张三", chat_id: null, auth_user_id: null },
      { id: "me", email: "me@example.com", auth_user_id: "auth-1", chat_name: null, chat_id: null, ...me },
    ],
    providers: [{ id: "old" }, { id: "other" }, { id: "me" }],
    customers: [],
    resources: [],
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const peopleWrites = () => fake.writes.filter((w) => w.table === "people");

beforeEach(() => vi.resetModules());

describe("saveContact", () => {
  const save = async (fields: Record<string, string>) => {
    const { saveContact } = await import("@/app/provider/actions");
    return saveContact(form(fields)).catch((e: Error) => e.message);
  };

  it("没填昵称不让存，一个字都不写", async () => {
    seed();
    expect(await save({ chat_id: "wx123" })).toBe("REDIRECT:/provider?edit=contact&error=chat");
    expect(peopleWrites()).toHaveLength(0);
  });

  it("没填账号也不让存", async () => {
    seed();
    expect(await save({ chat_name: "老李" })).toBe("REDIRECT:/provider?edit=contact&error=chat");
    expect(peopleWrites()).toHaveLength(0);
  });

  it("两样都齐了照常存，昵称也存上", async () => {
    seed();
    expect(await save({ chat_name: "老李", chat_id: "wx123" })).toBe("REDIRECT:/provider?saved=1");
    const me = fake.db.people.find((p: any) => p.id === "me");
    expect(me.chat_name).toBe("老李");
    expect(me.chat_id).toBe("wx123");
  });
});

describe("submitListing", () => {
  const card = { item_type: "alpha", holder_name: "Li Lao", holder_gender: "male", holder_date_of_birth: "1990-01-01" };
  const submit = async (fields: Record<string, string>) => {
    const { submitListing } = await import("@/app/provider/listing/actions");
    return submitListing(form({ ...card, ...fields })).catch((e: Error) => e.message);
  };

  it("没填昵称不让挂，卡不建、人不改", async () => {
    seed();
    expect(await submit({ chat_id: "wx123" })).toBe("REDIRECT:/provider/listing?error=chat");
    expect(fake.db.resources).toHaveLength(0);
    expect(peopleWrites()).toHaveLength(0);
  });

  it("没填账号也不让挂", async () => {
    seed();
    expect(await submit({ chat_name: "老李" })).toBe("REDIRECT:/provider/listing?error=chat");
    expect(fake.db.resources).toHaveLength(0);
  });

  it("两样都齐了照常挂，资源挂在自己名下", async () => {
    seed();
    expect(await submit({ chat_name: "老李", chat_id: "wx123" })).toBe("REDIRECT:/provider?listed=1");
    expect(fake.db.resources).toHaveLength(1);
    expect(fake.db.resources[0].provider_id).toBe("me");
  });
});

describe("mergeProvider", () => {
  const merge = async (drop: string, keep: string) => {
    const { mergeProvider } = await import("@/app/admin/providers/actions");
    return mergeProvider(form({ drop, keep })).catch((e: Error) => e.message);
  };
  const rpcCalls = () => fake.writes.filter((w) => w.op === "rpc");

  it("提示着的那一对：调 merge_person，老物主留着", async () => {
    seed({ chat_name: "老李", chat_id: "wx123" });
    expect(await merge("me", "old")).toBe("REDIRECT:/admin/providers");
    expect(rpcCalls()).toEqual([{ op: "rpc", table: "merge_person", payload: { keep_id: "old", drop_id: "me" } }]);
  });

  it("拿一个对不上的老物主来合，拦住不调", async () => {
    seed({ chat_name: "老李", chat_id: "wx123" });
    expect(await merge("me", "other")).toMatch(/^REDIRECT:\/admin\/providers\?merge_error=/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("两头反过来（删老物主、留新账号），拦住不调", async () => {
    seed({ chat_name: "老李", chat_id: "wx123" });
    expect(await merge("old", "me")).toMatch(/^REDIRECT:\/admin\/providers\?merge_error=/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("库函数报错时把原因带回页面", async () => {
    seed({ chat_name: "老李", chat_id: "wx123" });
    fake.failNextWriteWith("老客人已经绑了登录账号，不能再合", "merge_person");
    expect(decodeURIComponent(String(await merge("me", "old")))).toContain("老客人已经绑了登录账号");
  });
});
