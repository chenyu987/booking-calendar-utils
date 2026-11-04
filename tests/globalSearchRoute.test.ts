import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// ⌘K 全局搜索的 Route Handler（app/admin/search/route.ts）。
// 只读，没有要拦的写操作；这里盯的是「搜到的东西对不对」：
// 名字里带 _ 的不能被当通配、一个人两种身份两条都出、备注搜到的单子跟名字搜到的不重复。

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

function seed() {
  const fake = createFakeSupabase({
    people: [
      { id: "p1", chat_name: "小王", chat_id: "wang_1", email: "w@x.com" },
      { id: "p2", chat_name: "大李", chat_id: "wangX1" },
      { id: "p3", chat_name: "老张", phone_number: "6045551234" },
    ],
    customers: [{ id: "p1" }, { id: "p2" }],
    providers: [{ id: "p1" }, { id: "p3" }],
    orders: [
      { id: "o1", customer_id: "p1", demand_days: ["2025-01-02"], location: "akaad", status: "created" },
      { id: "o2", customer_id: "p2", demand_days: ["2025-02-02"], location: "locaa", status: "complete" },
    ],
    order_notes: [{ id: "n1", order_id: "o1", internal_note: "一女21岁 酒店取资源 小王朋友" }],
    resources: [{ id: "s1", provider_id: "p3", holder_name: "Zhang San", item_type: "alpha" }],
    chat_requests: [{ id: "r1", sender: "活动小王", group_name: "城东群", quote: "求一张 alpha 1/5" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

async function search(q: string) {
  const { GET } = await import("@/app/admin/search/route");
  const res = await GET(new Request(`http://x/admin/search?q=${encodeURIComponent(q)}`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { hits: { group: string; title: string; href: string }[] }).hits;
}

describe("GET /admin/search", () => {
  beforeEach(seed);

  it("空搜索词不查库，直接空", async () => {
    expect(await search("   ")).toEqual([]);
  });

  it("_ 是字面字符：wang_1 对不上 wangX1", async () => {
    const hits = await search("wang_1");
    expect(hits.filter((h) => h.group === "客户").map((h) => h.title)).toEqual(["小王"]);
  });

  it("一个人既是客户又是物主，两条都出；他的单子也出", async () => {
    const hits = await search("小王");
    expect(hits.filter((h) => h.title === "小王").map((h) => h.group)).toEqual(["客户", "物主"]);
    expect(hits.find((h) => h.group === "订单")?.href).toBe("/admin/overview?season=24-25-na&assign=o1");
    // 需求的发言人「活动小王」也包含「小王」
    expect(hits.some((h) => h.group === "需求" && h.title === "活动小王")).toBe(true);
  });

  it("按订单备注搜得到单子；名字和备注都对上的单子只出一次", async () => {
    expect((await search("酒店取资源")).filter((h) => h.group === "订单")).toHaveLength(1);
    // o1 是小王的，备注里也写着小王：两条路都搜到它
    const hits = await search("小王");
    expect(hits.filter((h) => h.group === "订单")).toHaveLength(1);
  });

  it("持有人、电话都搜得到；大小写不分", async () => {
    const hits = await search("zhang");
    expect(hits.find((h) => h.group === "资源")?.title).toBe("Zhang San");
    expect((await search("555123")).map((h) => h.title)).toContain("老张");
  });
});
