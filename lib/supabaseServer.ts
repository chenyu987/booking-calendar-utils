import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { paginatingFetch } from "./fetchAllRows";

// lib/supabase.ts 那个是模块级单例、不带登录态，admin 页面用它就够了。
// 但「当前访问者是谁」存在 cookie 里，服务端必须**按请求**读 cookie 才知道，
// 单例做不到 —— 所以客户这边每个请求现造一个。
export function createSupabaseServerClient() {
  // Next 15 起 cookies() 是 Promise。在 getAll / setAll 里面 await，
  // 这个函数本身就还是同步的，调用它的十来处不用改
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      // 物主页也要查整季的单和分配，一样会碰到 1000 行上限（lib/fetchAllRows.ts）
      global: { fetch: paginatingFetch((input, init) => fetch(input, { ...init, cache: "no-store" })) },
      cookies: {
        getAll: async () => (await cookieStore).getAll(),
        setAll: async (toSet) => {
          const store = await cookieStore;
          try {
            for (const { name, value, options } of toSet) {
              store.set(name, value, options);
            }
          } catch {
            // Server Component 里不允许写 cookie（只有 Route Handler 和 Server Action 能）。
            // 刷新 token 这种写操作在页面渲染时会走到这里，忽略即可：
            // 真正的写入发生在 /auth/callback 和退出登录那两个 Route Handler 里。
          }
        },
      },
    }
  );
}

/** 当前登录的人，没登录返回 null。调用方只用得着这两样 */
export type SessionUser = { id: string; email: string | null };

/**
 * **用 getClaims 不用 getUser。**
 *
 * `getUser()` 每次都往 Supabase 的 auth 服务器跑一趟验 token —— 实测 **350~380ms，
 * 每个请求都要**。而物主这一页每次交互都要先认一次身份，等于每次点击先交 0.35 秒。
 *
 * `getClaims()` 在项目用非对称签名密钥时**本地验签**：第一次拉一下 JWKS（实测 415ms），
 * 之后缓存着，一次 1~3ms。验的是同一个签名，不是「读了 cookie 就信」——
 * 真正不能信的是 `getSession()`，那个不验签。
 *
 * 万一某天项目换回对称密钥（getClaims 那时会退化成一次网络请求）或者环境里没有
 * WebCrypto，claims 会拿不到，那就退回 getUser()：慢，但不会把人挡在门外。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (claims?.sub) {
    return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  }

  const { data: fallback } = await supabase.auth.getUser();
  return fallback.user ? { id: fallback.user.id, email: fallback.user.email ?? null } : null;
}
