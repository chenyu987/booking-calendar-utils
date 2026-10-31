import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 客户留聊天（2026-10-25）两道服务端的门：
// - 发需求（app/customer/request/actions.ts）：昵称和账号不齐不让发。界面上按钮是灰的，curl 绕得过去
// - 合并老客人（app/admin/customers/actions.ts）：只许合页面上还提示着的那一对，不然 POST 两个 id 就能把任意两个人揉成一个

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
vi.mock("@/lib/supabaseServer", () => ({
  getSessionUser: async () => ({ id: "auth-1", email: "me@example.com" }),
}));

let fake: ReturnType<typeof createFakeSupabase>;

function seed(me: Record<string, any>) {
  fake = createFakeSupabase({
    people: [
      { id: "old", chat_name: "小王", chat_id: null, auth_user_id: null },
      { id: "other", chat_name: "张三", chat_id: null, auth_user_id: null },
      { id: "me", email: "me@example.com", auth_user_id: "auth-1", ...me },
    ],
    customers: [{ id: "old" }, { id: "other" }, { id: "me" }],
    providers: [],
    orders: [],
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => vi.resetModules());

describe("submitRequest", () => {
  const order = { location: "akaad", male_count: "1", female_count: "0", start_date: "2026-12-20", end_date: "2026-12-21" };
  const submit = async () => {
    const { submitRequest } = await import("@/app/customer/request/actions");
    return submitRequest(form(order)).catch((e: Error) => e.message);
  };

  it("没填账号不让发，一行都不写", async () => {
    seed({ chat_name: "小王", chat_id: null });
    expect(await submit()).toBe("REDIRECT:/customer/request?error=chat");
    expect(fake.db.orders).toHaveLength(0);
  });

  it("没填昵称也不让发", async () => {
    seed({ chat_name: null, chat_id: "wx123" });
    expect(await submit()).toBe("REDIRECT:/customer/request?error=chat");
    expect(fake.db.orders).toHaveLength(0);
  });

  it("两样都齐了照常建单", async () => {
    seed({ chat_name: "小王", chat_id: "wx123" });
    expect(await submit()).toBe("REDIRECT:/customer?created=1");
    expect(fake.db.orders).toHaveLength(1);
    expect(fake.db.orders[0].customer_id).toBe("me");
  });
});

describe("mergeCustomer", () => {
  const merge = async (drop: string, keep: string) => {
    const { mergeCustomer } = await import("@/app/admin/customers/actions");
    return mergeCustomer(form({ drop, keep })).catch((e: Error) => e.message);
  };
  const rpcCalls = () => fake.writes.filter((w) => w.op === "rpc");

  it("提示着的那一对：调 merge_person，老客人留着", async () => {
    seed({ chat_name: "小王", chat_id: "wx123" });
    expect(await merge("me", "old")).toBe("REDIRECT:/admin/customers?saved=old");
    expect(rpcCalls()).toEqual([{ op: "rpc", table: "merge_person", payload: { keep_id: "old", drop_id: "me" } }]);
  });

  it("拿一个对不上的老客人来合，拦住不调", async () => {
    seed({ chat_name: "小王", chat_id: "wx123" });
    expect(await merge("me", "other")).toMatch(/^REDIRECT:\/admin\/customers\?merge_error=/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("两头反过来（删老客人、留新账号），拦住不调", async () => {
    seed({ chat_name: "小王", chat_id: "wx123" });
    expect(await merge("old", "me")).toMatch(/^REDIRECT:\/admin\/customers\?merge_error=/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("库函数报错时把原因带回页面", async () => {
    seed({ chat_name: "小王", chat_id: "wx123" });
    fake.failNextWriteWith("老客人已经绑了登录账号，不能再合", "merge_person");
    expect(decodeURIComponent(String(await merge("me", "old")))).toContain("老客人已经绑了登录账号");
  });
});
