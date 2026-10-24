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
    expect(await save({ id: "l1", status: "contacted", admin_note: " 加了聊天 ", back: "new" })).toBe(
      "REDIRECT:/admin/chat-requests?status=new"
    );
    expect(request().status).toBe("contacted");
    expect(request().admin_note).toBe("加了聊天");
  });

  it("认不出的状态不写库", async () => {
    expect(await save({ id: "l1", status: "deleted", back: "new" })).toBe("REDIRECT:/admin/chat-requests?status=new&error=bad");
    expect(request().status).toBe("new");
  });

  it("表单里夹带的其他列不会写进去", async () => {
    await save({ id: "l1", status: "won", quote: "改过的原文", sender: "别人" });
    expect(request().quote).toBe("求一张男 beta");
    expect(request().sender).toBe("Alex");
  });

  it("back 只认本页的筛选，不带人去别处", async () => {
    expect(await save({ id: "l1", status: "won", back: "https://evil.example" })).toBe("REDIRECT:/admin/chat-requests");
  });

  it("备注清空存 null，太长截断", async () => {
    await save({ id: "l1", status: "new", admin_note: "   " });
    expect(request().admin_note).toBeNull();
    await save({ id: "l1", status: "new", admin_note: "x".repeat(600) });
    expect(request().admin_note).toHaveLength(500);
  });
});
