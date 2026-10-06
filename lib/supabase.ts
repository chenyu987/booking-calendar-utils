import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: paginatingFetch(noStoreFetch),
  },
});
