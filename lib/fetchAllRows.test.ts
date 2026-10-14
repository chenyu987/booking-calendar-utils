import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { PAGE_SIZE, STABLE_KEY, paginatingFetch, withStableOrder } from "./fetchAllRows";

const BASE = "https://x.supabase.co/rest/v1";

/**
 * 假的 PostgREST：一张有 n 行的表，认 order/limit/offset。
 * cap = 服务器的 max-rows（项目设置），默认 1000 —— 模拟**设置没改过的库**。
 * 请求里带了 Prefer: count=… 就在 Content-Range 里给总数（noCount 时不给，模拟拿不到总数）
 */
function fakeServer(n: number, opts: { failAtOffset?: number; cap?: number; noCount?: boolean } = {}) {
  const cap = opts.cap ?? 1000;
  const rows = Array.from({ length: n }, (_, i) => ({ id: `id-${String(n - i).padStart(6, "0")}`, v: i }));
  const calls: string[] = [];
  const prefers: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.search);
    const headers = new Headers(init?.headers);
    prefers.push(headers.get("prefer") ?? "");
    if ((init?.method ?? "GET") !== "GET") return new Response("{}", { status: 201 });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (opts.failAtOffset !== undefined && offset === opts.failAtOffset) {
      return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    }
    let list = [...rows];
    const order = url.searchParams.get("order");
    if (order?.startsWith("id")) list.sort((a, b) => a.id.localeCompare(b.id));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? cap), cap);
    list = list.slice(offset, offset + limit);
    const out = new Headers();
    if (!opts.noCount && /count=/.test(headers.get("prefer") ?? "")) {
      out.set("content-range", `${offset}-${offset + list.length - 1}/${n}`);
    }
    const body = (headers.get("accept") ?? "").includes("vnd.pgrst.object") ? list[0] : list;
    return new Response(JSON.stringify(body), { status: 200, headers: out });
  };
  return { rows, calls, prefers, fetchImpl };
}

describe("paginatingFetch：被服务器截了就自动分页拉全", () => {
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
    // 从第一个请求起就按 order=id.asc 拉，三页正好三个请求
    expect(s.calls.every((q) => q.includes("order=id.asc"))).toBe(true);
    expect(s.calls).toHaveLength(3);
  });

  it("**第一页不白拉**：拿满了接着往后拉，不从头重拉一遍", async () => {
    // 原来第一次不排序，满了再从 offset=0 重拉 —— 排期总览那一下白等两秒多
    const s = fakeServer(1800);
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(await res.json()).toHaveLength(1800);
    const offsets = s.calls.map((q) => new URLSearchParams(q).get("offset"));
    expect(offsets).toEqual(["0", "1000"]);
  });

  it("本来就排了序的：保留原来的顺序，只在后面补 id 兜底", async () => {
    const s = fakeServer(1500);
    await paginatingFetch(s.fetchImpl)(`${BASE}/resources?select=*&order=date_range_start.asc`);
    expect(s.calls.every((q) => decodeURIComponent(q).includes("order=date_range_start.asc,id.asc"))).toBe(true);
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

  it("**max-rows 调到 10000 的库：3449 行一个请求拿完**", async () => {
    const s = fakeServer(3449, { cap: 10000 });
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(await res.json()).toHaveLength(3449);
    expect(s.calls).toHaveLength(1);
  });

  it("**设置没改的库（还是 1000）：照样拉全，不在 1000 行处悄悄截断**", async () => {
    // PAGE_SIZE 现在是 10000，服务器只给 1000 —— 要是还拿「没拿满 PAGE_SIZE 就算完」判断，
    // 这里只会拿回 1000 行，页面上看着一切正常
    expect(PAGE_SIZE).toBeGreaterThan(1000);
    const s = fakeServer(3449, { cap: 1000 });
    const got = (await (await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`)).json()) as { id: string }[];
    expect(got).toHaveLength(3449);
    expect(new Set(got.map((r) => r.id)).size).toBe(3449);
    expect(s.calls.map((q) => new URLSearchParams(q).get("offset"))).toEqual(["0", "1000", "2000", "3000"]);
  });

  it("服务器没给总数（Content-Range 缺了）：按它实际给的页大小一页页拉，拉到不满为止", async () => {
    const s = fakeServer(2500, { cap: 1000, noCount: true });
    const res = await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`);
    expect(await res.json()).toHaveLength(2500);
  });

  it("调用方自己要了 count 的：原样留着，不改成 exact", async () => {
    const s = fakeServer(10);
    await paginatingFetch(s.fetchImpl)(`${BASE}/orders?select=*`, { headers: { Prefer: "count=planned" } });
    expect(s.prefers[0]).toBe("count=planned");
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
    for (const q of s.calls) {
      expect(decodeURIComponent(q)).toContain("order=person_id.asc,admin_id.asc");
      expect(decodeURIComponent(q)).not.toMatch(/order=[^&]*(^|,)id\.asc/);
    }
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
