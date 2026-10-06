// Supabase（PostgREST）一次查询**最多返回 1000 行**，多的直接截掉，也不报错。
//
//
// 这里包一层 fetch，**一处管全站**（跟 lib/supabase.ts 那层 no-store 一个思路）：
// 列表查询一次正好拿满 1000 行，就说明被截了，带上稳定排序一页一页重新拉，合起来再返回。
// 不满 1000 的照旧，一个请求都不多发。

/** Supabase 默认的 max-rows。改过项目设置的话这里跟着改 */
export const PAGE_SIZE = 1000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return new URL(input.href);
  return new URL(input.url);
}

/**
 * 分页时必须有稳定的顺序，不然页与页之间会重复或漏行。
 * 已经排了序的，在后面补一个 id 兜底；没排的就按 id 排
 */
function withStableOrder(order: string | null): string {
  if (!order) return "id.asc";
  const cols = order.split(",").map((p) => p.split(".")[0]);
  return cols.includes("id") ? order : `${order},id.asc`;
}

export function paginatingFetch(base: FetchLike): FetchLike {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = urlOf(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const isRest = url.pathname.includes("/rest/v1/");
    // .single() / .maybeSingle() 要的是一个对象，不是列表
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    // 调用方自己分了页（.range / .limit），尊重它
    const explicit = url.searchParams.has("limit") || url.searchParams.has("offset") || headers.has("range");
    if (method !== "GET" || !isRest || single || explicit) return base(input, init);

    const first = await base(input, init);
    if (!first.ok) return first;
    const rows = await first
      .clone()
      .json()
      .catch(() => null);
    if (!Array.isArray(rows) || rows.length < PAGE_SIZE) return first;

    // 拿满了：从头按稳定顺序一页一页拉。第一页不复用 —— 它没排序，跟后面的页对不上
    url.searchParams.set("order", withStableOrder(url.searchParams.get("order")));
    const all: unknown[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const res = await base(url.toString(), { ...init, method: "GET" });
      // 中间某页出错就原样把错误交出去，别拿半截数据装作完整的
      if (!res.ok) return res;
      const page = (await res.json()) as unknown[];
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return new Response(JSON.stringify(all), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
}
