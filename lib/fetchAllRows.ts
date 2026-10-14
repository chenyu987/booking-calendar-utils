// Supabase（PostgREST）一次查询**最多返回 max-rows 行**（项目设置，默认 1000），多的直接截掉，也不报错。
//
//
// 这里包一层 fetch，**一处管全站**（跟 lib/supabase.ts 那层 no-store 一个思路）：
// 列表查询一律带上稳定排序、顺便要一个总行数（Prefer: count=exact）；第一页拿到的比总数少，
// 就说明被截了，按服务器实际给的页大小接着往下拉，合起来再返回。拿全了的一个请求都不多发。

/** 一次向服务器要多少行。服务器自己还有个上限（max-rows），给得少了照样能拉全，见上面 */
export const PAGE_SIZE = 10000;

/** Content-Range 里的总行数：「0-999/3449」→ 3449；没有或是「*」→ null */
export function totalFromContentRange(header: string | null): number | null {
  const m = header?.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return new URL(input.href);
  return new URL(input.url);
}

/**
 * **主键不是 `id` 的表**，分页时按什么兜底排序（能唯一确定一行的那几列）。
 *
 * 默认按 id —— 绝大多数表都有。但这几张没有，照默认加 `order=id.asc` 的话
 * PostgREST 直接报「column … id does not exist」，整条查询失败。平时碰不到，
 * 一过 1000 行就炸：2026-10-06 导入数据后 person_contacts 涨到 1915 行，
 * Customer 管理整页 500。
 *
 * **新建一张主键不叫 id 的表，记得在这儿登记一行。** lib/fetchAllRows.test.ts 里
 * 有一条拿 0001_init.sql 对这张表的测试，漏登记会红。
 */
export const STABLE_KEY: Record<string, string[]> = {
  person_contacts: ["person_id", "admin_id"],
  day_notes: ["day"],
  app_settings: ["key"],
};

/** URL 里是哪张表：/rest/v1/<table> */
function tableOf(url: URL): string {
  return url.pathname.split("/rest/v1/")[1]?.split("/")[0] ?? "";
}

/**
 * 分页时必须有稳定的顺序，不然页与页之间会重复或漏行。
 * 已经排了序的，在后面补上这张表的唯一键兜底（默认 id）；没排的就按唯一键排
 */
export function withStableOrder(order: string | null, table = ""): string {
  const key = STABLE_KEY[table] ?? ["id"];
  const cols = (order ?? "").split(",").filter(Boolean).map((p) => p.split(".")[0]);
  const missing = key.filter((k) => !cols.includes(k)).map((k) => `${k}.asc`);
  return [...(order ? [order] : []), ...missing].join(",");
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

    url.searchParams.set("order", withStableOrder(url.searchParams.get("order"), tableOf(url)));
    url.searchParams.set("limit", String(PAGE_SIZE));
    // 要总行数：靠它判断被没被服务器截掉，不去猜服务器的 max-rows 设成了多少。
    // 调用方自己要了 count 的，原样留着
    const prefer = headers.get("prefer") ?? "";
    if (!/count=/.test(prefer)) headers.set("prefer", prefer ? `${prefer},count=exact` : "count=exact");
    const pageAt = (offset: number) => {
      url.searchParams.set("offset", String(offset));
      return base(url.toString(), { ...init, method: "GET", headers });
    };

    const first = await pageAt(0);
    if (!first.ok) return first;
    const rows = await first
      .clone()
      .json()
      .catch(() => null);
    if (!Array.isArray(rows)) return first;
    const total = totalFromContentRange(first.headers.get("content-range"));
    // 服务器这一次实际给了多少，就是它的页大小（max-rows 或者 PAGE_SIZE，取小的那个）
    const step = rows.length;
    // 拿全了：比总数。万一服务器没给总数，**不能**拿「没拿满 PAGE_SIZE」当拿全了 ——
    // 服务器上限比 PAGE_SIZE 小的时候（设置没改的库），那正好就是在上限处截断。
    // 没总数就再探一页，探到空页或者不满一页为止（多一个请求，换不截断）
    if (step === 0 || (total !== null && rows.length >= total)) return first;

    const all: unknown[] = [...rows];
    for (let offset = step; ; offset += step) {
      const res = await pageAt(offset);
      // 中间某页出错就原样把错误交出去，别拿半截数据装作完整的
      if (!res.ok) return res;
      const page = (await res.json()) as unknown[];
      all.push(...page);
      // 没总数的时候，一页没拿满就是到底了
      if (page.length === 0 || (total !== null ? all.length >= total : page.length < step)) break;
    }
    return new Response(JSON.stringify(all), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
}
