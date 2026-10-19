import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { ADMIN_ID_HEADER, AUTH_UID_HEADER, isUuid } from "./adminAuth";
import { paginatingFetch } from "./fetchAllRows";

// **这个 client 用的是 service key，只能在服务端用。**
//
// 库开了 RLS（迁移 0026），而且一条策略都没写：浏览器里那把 anon key 什么数据都读不到、
// 写不了，只剩登录用。所有读写都走这儿 —— service key 不受 RLS 管。
// 谁能看什么由我们的服务端代码决定：/admin 由 middleware 拦，客户 / 物主页面按登录的人过滤。
//
// 不会漏进浏览器包：这个文件 import 了 next/headers（客户端组件 import 它构建直接报错），
// 变量名也没有 NEXT_PUBLIC_ 前缀（就算被打包，读出来也是 undefined）。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceKey) {
  // supabase-js 自己抛的错是 "supabaseUrl is required"，不好排查，这里换个说人话的
  throw new Error(
    "缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。" +
      "把 .env.example 复制成 .env.local，去 Supabase 控制台 Project Settings → API Keys 里抄。"
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

/**
 * 写库时带上「是谁改的」，给改动记录用：0025/0026 的 trigger 从 PostgREST 的
 * `request.headers` 里读 `x-admin-id`（管理员）和 `x-auth-uid`（客户 / 物主的登录账号）。
 * 这两个头是 middleware 验完登录 token 写进来的（lib/adminAuth.ts），不是浏览器给的。
 *
 * 放在 client 的 fetch 上而不是每个写库的地方各传一遍 —— 入口几十处，漏一处就是一段
 * 「不知道谁改的」。client 是模块级单例，但 fetch 是在请求里调的，`headers()` 在
 * server action 和 route handler 里都读得到当前这个请求的头。
 *
 * **只碰写请求。** 读请求不需要，而且页面渲染时调 `headers()` 会把这一页拖成动态渲染 ——
 * 写请求只会出现在 action / route 里，没这个顾虑。
 * 不在请求里（脚本、测试）`headers()` 会抛，那就不带：记录里「谁」是空的，写照常写。
 */
const withActorHeaders =
  (f: typeof fetch): typeof fetch =>
  async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return f(input, init);
    let adminId: string | null = null;
    let authUid: string | null = null;
    try {
      const h = await headers();
      adminId = h.get(ADMIN_ID_HEADER);
      authUid = h.get(AUTH_UID_HEADER);
    } catch {
      // 不在请求里
    }
    if (!isUuid(adminId) && !isUuid(authUid)) return f(input, init);
    const out = new Headers(init?.headers);
    if (isUuid(adminId)) out.set(ADMIN_ID_HEADER, adminId);
    if (isUuid(authUid)) out.set(AUTH_UID_HEADER, authUid);
    return f(input, { ...init, headers: out });
  };

export const supabase = createClient(supabaseUrl, serviceKey, {
  // 服务端单例不该有「登录态」：不存 session、不自己续 token（登录态在 supabaseServer.ts）
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: paginatingFetch(withActorHeaders(noStoreFetch)),
  },
});
