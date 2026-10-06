import { describe, expect, it } from "vitest";

import { PAGE_SIZE, paginatingFetch } from "./fetchAllRows";

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
