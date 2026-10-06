import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { PAGE_SIZE, STABLE_KEY, paginatingFetch, withStableOrder } from "./fetchAllRows";

const BASE = "https://x.supabase.co/rest/v1";

/** 假的 PostgREST：一张有 n 行的表，一次最多返回 PAGE_SIZE 行，认 order/limit/offset */
function fakeServer(n: number, opts: { failAtOffset?: number } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `id-${String(n - i).padStart(6, "0")}`, v: i }));
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.search);
    if ((init?.method ?? "GET") !== "GET") return new Response("{}", { status: 201 });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (opts.failAtOffset !== undefined && offset === opts.failAtOffset) {
      return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    }
    let list = [...rows];
    const order = url.searchParams.get("order");
    if (order?.startsWith("id")) list.sort((a, b) => a.id.localeCompare(b.id));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? PAGE_SIZE), PAGE_SIZE);
    list = list.slice(offset, offset + limit);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const body = accept.includes("vnd.pgrst.object") ? list[0] : list;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { rows, calls, fetchImpl };
}

describe("paginatingFetch：超过 1000 行自动分页拉全", () => {
  it("不到 1000 行：照旧，只发一个请求", async () => {
    const s = fakeServer(300);
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(await res.json()).toHaveLength(300);
    expect(s.calls).toHaveLength(1);
  });

  it("2500 行：拉全，一行不多一行不少，按 id 稳定排序", async () => {
    const s = fakeServer(2500);
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/order_assignments?select=order_id,resource_id`);
    const got = (await res.json()) as { id: string }[];
    expect(got).toHaveLength(2500);
    expect(new Set(got.map((r) => r.id)).size).toBe(2500);
    // 第一次探出满了，然后按 order=id.asc 拉三页
    expect(s.calls.slice(1).every((q) => q.includes("order=id.asc"))).toBe(true);
    expect(s.calls).toHaveLength(4);
  });

  it("本来就排了序的：保留原来的顺序，只在后面补 id 兜底", async () => {
    const s = fakeServer(1500);
    await paginatingFetch(s.fetchImpl)(`${BASE}/resources?select=*&order=date_range_start.asc`);
    expect(decodeURIComponent(s.calls[1])).toContain("order=date_range_start.asc,id.asc");
  });

  it("正好 1000 行：多拉一页确认拉完了，结果还是 1000", async () => {
    const s = fakeServer(1000);
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(await res.json()).toHaveLength(1000);
  });

  it("不碰的：.single()、自己写了 limit、写入", async () => {
    const s = fakeServer(2500);
    const f = paginatingFetch(s.fetchImpl);
    await f(`${BASE}/orders?select=*&id=eq.x`, { headers: { Accept: "application/vnd.pgrst.object+json" } });
    await f(`${BASE}/orders?select=*&limit=10`);
    await f(`${BASE}/orders`, { method: "POST", body: "{}" });
    expect(s.calls).toHaveLength(3);
  });

  it("中间某页出错：把错误交出去，不拿半截数据装完整", async () => {
    const s = fakeServer(2500, { failAtOffset: 1000 });
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(res.ok).toBe(false);
  });
});

describe("主键不叫 id 的表", () => {
  it("**person_contacts 按 person_id, admin_id 排，不加 id** —— 加了 PostgREST 直接报错", () => {
    expect(withStableOrder(null, "person_contacts")).toBe("person_id.asc,admin_id.asc");
    expect(withStableOrder(null, "app_settings")).toBe("key.asc");
    expect(withStableOrder(null, "day_notes")).toBe("day.asc");
  });

  it("已经排了序的：保留原来的，只补上缺的唯一键", () => {
    expect(withStableOrder("admin_id.desc", "person_contacts")).toBe("admin_id.desc,person_id.asc");
    expect(withStableOrder("created_at.desc", "orders")).toBe("created_at.desc,id.asc");
    expect(withStableOrder("id.desc", "orders")).toBe("id.desc");
  });

  it("分页时真的按这张表的唯一键去拉", async () => {
    const s = fakeServer(1500);
    await paginatingFetch(s.fetchImpl)(`${BASE}/person_contacts?select=person_id,admin_id`);
    expect(decodeURIComponent(s.calls[1])).toContain("order=person_id.asc,admin_id.asc");
    expect(decodeURIComponent(s.calls[1])).not.toMatch(/order=[^&]*(^|,)id\.asc/);
  });

  it("**0001_init.sql 里每张主键不叫 id 的表都登记了** —— 新建这种表漏登记，一过 1000 行整页报错", () => {
    const sql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    const tables = [...sql.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)];
    const noId = tables
      .filter(([, , body]) => !/^\s*id\s+\w+.*primary key/m.test(body))
      .map(([, name]) => name)
      .sort();
    expect(noId.length).toBeGreaterThan(0);
    expect(Object.keys(STABLE_KEY).sort()).toEqual(noId);
  });
});
