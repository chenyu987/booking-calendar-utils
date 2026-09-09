import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// lib/supabase.ts 那个是模块级单例、不带登录态，admin 页面用它就够了。
// 但「当前访问者是谁」存在 cookie 里，服务端必须**按请求**读 cookie 才知道，
// 单例做不到 —— 所以客户这边每个请求现造一个。
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
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

// 当前登录的人，没登录返回 null
export async function getSessionUser() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
