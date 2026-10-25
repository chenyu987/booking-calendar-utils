import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";


vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
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

beforeEach(() => {
  vi.resetModules();
  fake = createFakeSupabase({
    chat_requests: [{ id: "l1", sender: "Alex", quote: "求一张男 beta", status: "new", admin_note: null }],
    chat_groups: [{ id: "g1", name: "Xyz 活动", active: true, note: null }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function save(fields: Record<string, string>) {
  const { updateRequest } = await import("@/app/admin/chat-requests/actions");
  return updateRequest(form(fields)).catch((e: Error) => e.message);
}

const request = () => fake.db.chat_requests[0];

describe("updateRequest", () => {
  it("改状态和备注，回到原来的筛选", async () => {
    expect(await save({ id: "l1", status: "contacted", admin_note: " 加了聊天 ", back: "?sender=Al&item=beta" })).toBe(
      "REDIRECT:/admin/chat-requests?sender=Al&item=beta"
    );
    expect(request().status).toBe("contacted");
    expect(request().admin_note).toBe("加了聊天");
  });

  it("表单里没有备注字段（页面上拿掉了备注框）就不动原来的备注", async () => {
    await save({ id: "l1", status: "new", admin_note: "以前写的" });
    await save({ id: "l1", status: "contacted" });
    expect(request().status).toBe("contacted");
    expect(request().admin_note).toBe("以前写的");
  });

  it("认不出的状态不写库", async () => {
    expect(await save({ id: "l1", status: "deleted", back: "?status=all" })).toBe("REDIRECT:/admin/chat-requests?status=all&error=bad");
    expect(request().status).toBe("new");
  });

  it("表单里夹带的其他列不会写进去", async () => {
    await save({ id: "l1", status: "won", quote: "改过的原文", sender: "别人" });
    expect(request().quote).toBe("求一张男 beta");
    expect(request().sender).toBe("Alex");
  });

  it("back 只认本页的筛选，不带人去别处", async () => {
    expect(await save({ id: "l1", status: "won", back: "https://evil.example" })).toBe("REDIRECT:/admin/chat-requests");
    expect(await save({ id: "l1", status: "won", back: "?next=https://evil.example&group=x" })).toBe(
      "REDIRECT:/admin/chat-requests"
    );
  });

  it("备注清空存 null，太长截断", async () => {
    await save({ id: "l1", status: "new", admin_note: "   " });
    expect(request().admin_note).toBeNull();
    await save({ id: "l1", status: "new", admin_note: "x".repeat(600) });
    expect(request().admin_note).toHaveLength(500);
  });
});

async function group(action: "createGroup" | "updateGroup" | "deleteGroup", fields: Record<string, string>) {
  const mod = await import("@/app/admin/chat-requests/actions");
  return mod[action](form(fields)).catch((e: Error) => e.message);
}

describe("群名单", () => {
  it("加群：名字原样存，默认在抓，回来时群名单是展开的", async () => {
    expect(await group("createGroup", { name: " ABC互助群 ", back: "?status=all" })).toBe(
      "REDIRECT:/admin/chat-requests?status=all&groups=open"
    );
    expect(fake.db.chat_groups.find((g: any) => g.name === "ABC互助群")?.active).toBe(true);
  });

  it("重名（不分大小写空格）不写库", async () => {
    expect(await group("createGroup", { name: "xyz活动" })).toBe("REDIRECT:/admin/chat-requests?group_error=dup");
    expect(fake.db.chat_groups).toHaveLength(1);
  });

  it("改名、停抓", async () => {
    await group("updateGroup", { id: "g1", name: "Xyz 活动 2", note: "人少" });
    expect(fake.db.chat_groups[0]).toMatchObject({ name: "Xyz 活动 2", active: false, note: "人少" });
    await group("updateGroup", { id: "g1", name: "Xyz 活动 2", active: "on" });
    expect(fake.db.chat_groups[0].active).toBe(true);
  });

  it("改成空名字不写库", async () => {
    expect(await group("updateGroup", { id: "g1", name: "  ", active: "on" })).toBe(
      "REDIRECT:/admin/chat-requests?group_error=empty"
    );
    expect(fake.db.chat_groups[0].name).toBe("Xyz 活动");
  });
});

describe("删群", () => {
  it("群没了，需求还在；回来时群名单展开、筛选不变", async () => {
    fake.db.chat_requests[0].group_id = "g1";
    expect(await group("deleteGroup", { id: "g1", back: "?sender=Al" })).toBe(
      "REDIRECT:/admin/chat-requests?sender=Al&groups=open"
    );
    expect(fake.db.chat_groups).toHaveLength(0);
    expect(fake.db.chat_requests).toHaveLength(1);
  });

  it("没给 id 不删", async () => {
    await group("deleteGroup", {});
    expect(fake.db.chat_groups).toHaveLength(1);
  });
});

describe("批量改状态", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const C = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    fake.db.chat_requests.splice(0, fake.db.chat_requests.length,
      { id: A, status: "new", admin_note: "留着" },
      { id: B, status: "new", admin_note: null },
      { id: C, status: "new", admin_note: null });
  });

  async function bulk(ids: string[], fields: Record<string, string>) {
    const f = form(fields);
    for (const id of ids) f.append("ids", id);
    const { bulkUpdateRequests } = await import("@/app/admin/chat-requests/actions");
    return bulkUpdateRequests(f).catch((e: Error) => e.message);
  }
  const statusOf = (id: string) => fake.db.chat_requests.find((r: any) => r.id === id).status;

  it("只改勾了的，只改状态，回到原来的筛选", async () => {
    expect(await bulk([A, B], { bulk_status: "ignored", back: "?sender=x" })).toBe(
      "REDIRECT:/admin/chat-requests?sender=x&bulk=2"
    );
    expect([statusOf(A), statusOf(B), statusOf(C)]).toEqual(["ignored", "ignored", "new"]);
    expect(fake.db.chat_requests[0].admin_note).toBe("留着");
  });

  it("认不出的状态、一条没勾、勾的不是 uuid：都不写库", async () => {
    expect(await bulk([A], { bulk_status: "deleted" })).toBe("REDIRECT:/admin/chat-requests?error=bad");
    expect(await bulk([], { bulk_status: "ignored" })).toBe("REDIRECT:/admin/chat-requests?error=none_selected");
    expect(await bulk(["not-a-uuid"], { bulk_status: "ignored" })).toBe("REDIRECT:/admin/chat-requests?error=none_selected");
    expect([statusOf(A), statusOf(B), statusOf(C)]).toEqual(["new", "new", "new"]);
  });
});

describe("每天单价", () => {
  async function savePrices(fields: Record<string, string>) {
    const { saveRequestPrices } = await import("@/app/admin/chat-requests/actions");
    return saveRequestPrices(form(fields)).catch((e: Error) => e.message);
  }
  const setting = (key: string) => (fake.db.app_settings ?? []).find((r: any) => r.key === key)?.value;

  it("存进 app_settings；空的、负数、不是数都当不设", async () => {
    await savePrices({ price_beta: "60", price_alpha: "" });
    expect(setting("request_price_beta")).toBe("60");
    expect(setting("request_price_alpha")).toBeUndefined();
    await savePrices({ price_beta: "-5", price_alpha: "abc" });
    expect(setting("request_price_beta")).toBeUndefined();
  });
});
