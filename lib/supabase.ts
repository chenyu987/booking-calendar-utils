import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { ADMIN_COOKIE } from "./admins";
import { paginatingFetch } from "./fetchAllRows";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // supabase-js 自己抛的错是 "supabaseUrl is required"，不好排查，这里换个说人话的
  throw new Error(
    "缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY。" +
      "把 .env.example 复制成 .env.local，去 Supabase 控制台 Project Settings → API 里抄这两个值。"
  );
}

// **每个请求都要 `cache: "no-store"`**，不然 Next 会把查询结果缓存下来当成新的用。
//
// supabase-js 走的是全局 `fetch`，而 Next 在服务端把 `fetch` 换成了自己的版本 ——
// 它带一层 Data Cache，按 URL 缓存响应。查询 URL 是固定的（`/rest/v1/orders?select=…`），
// 于是后建的单子在某些渲染里整个看不见。
//
// 症状很难认：**同一页，硬刷新是对的，点一下（客户端软导航）就少几条**。
// 2026-09-12 实测排期总览，直接开是 39 单，点一个色块进分配态变成 31 单 ——
// 少掉的正好是最近建的 8 单。页面上 `export const dynamic = "force-dynamic"` 挡不住这个，
// 它管的是路由要不要静态化，不负责给 fetch 关缓存。
//
// 外面再包一层 paginatingFetch：列表查询超过 1000 行自动分页拉全（见 lib/fetchAllRows.ts）。
// **这两层都别拆**，也别另建一个不带它们的 client。
const noStoreFetch: typeof fetch =(input, init) => fetch(input, { ...init, cache: "no-store" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 写库时带上「当前身份」（排期总览标题旁边选的那个管理员），给改动记录用：
 * 0025 的 trigger 从 PostgREST 的 `request.headers` 里读 `x-admin-id`。
 *
 * 放在 client 的 fetch 上而不是每个写库的地方各传一遍 —— 入口几十处，漏一处就是一段
 * 「不知道谁改的」。client 是模块级单例，但 fetch 是在请求里调的，`cookies()` 在
 * server action 和 route handler 里都读得到当前这个请求的 cookie。
 *
 * **只碰写请求。** 读请求不需要，而且页面渲染时调 `cookies()` 会把这一页拖成动态渲染 ——
 * 写请求只会出现在 action / route 里，没这个顾虑。
 * 不在请求里（脚本、测试）`cookies()` 会抛，那就不带：记录里「谁」是空的，写照常写。
 */
const withAdminHeader =
  (f: typeof fetch): typeof fetch =>
  (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return f(input, init);
    let adminId: string | undefined;
    try {
      adminId = cookies().get(ADMIN_COOKIE)?.value;
    } catch {
      adminId = undefined;
    }
    // cookie 是浏览器给的，不是 uuid 就别往请求头里塞（非 ASCII 会让 Headers 直接抛）
    if (!adminId || !UUID_RE.test(adminId)) return f(input, init);
    const headers = new Headers(init?.headers);
    headers.set("x-admin-id", adminId);
    return f(input, { ...init, headers });
  };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: paginatingFetch(withAdminHeader(noStoreFetch)),
  },
});
