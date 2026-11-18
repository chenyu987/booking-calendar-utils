import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// 浏览器里的 Supabase client，**只用来收实时通知**（排期总览，迁移 0035）。
//
// 用的是 anon key + 登录 cookie 里的身份：库开着 RLS、一条读策略都没有，这把 key 在浏览器里
// 什么数据都读不到（CLAUDE.md「登录和 RLS」）。能收到的只有 realtime.messages 上那条策略放行的
// 「哪张表哪一行变了」，而且只有管理员账号收得到。**别拿它查库**，数据一律走服务端。
let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );
  return client;
}
