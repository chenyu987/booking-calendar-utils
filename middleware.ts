import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { ADMIN_COOKIE } from "@/lib/admins";
import {
  ADMIN_ID_HEADER,
  AUTH_UID_HEADER,
  adminIdFromClaims,
  pickAdminIdentity,
  isAdminPath,
} from "@/lib/adminAuth";
import { publicUrl } from "@/lib/publicUrl";

// 每个请求先过这儿：验登录 token，把「是谁」写进请求头往下传（lib/adminAuth.ts 开头有为什么）。
// /admin 底下没登录管理员账号的，页面跳登录，别的（Server Action、Route Handler）直接 401。
//
// 拦在 middleware 而不是 admin/layout.tsx：layout 只管页面渲染，**挡不住 Server Action 和
// Route Handler** —— 那些直接 POST 过来就执行了，正是要防的那条路。
//
// 顺带一件以前没人做的事：token 快过期时在这儿续上（@supabase/ssr 的 setAll）。
// 原来只有 /auth/callback 和退出登录两处写得了 cookie，页面渲染时续不上。
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const refreshed: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  let adminId: string | null = null;
  let authUid: string | null = null;

  const chosen = req.cookies.get(ADMIN_COOKIE)?.value;
  // E2E 构建（next.config.js 里设的，正常构建是 undefined）：没有真登录，当前身份 cookie 就是身份。
  // 没带 cookie 也放行 —— 有测试专门验「没选身份时不让建单」。种子里的 id 不是 uuid，所以不走 pickAdminIdentity
  const fakeLogin = process.env.E2E_FAKE_LOGIN === "1";
  if (fakeLogin) {
    adminId = chosen ?? null;
  } else {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list) => {
            for (const c of list) {
              // 改 req 上的：这次请求往下走就用新 token；记下来：响应里写回浏览器
              req.cookies.set(c.name, c.value);
              refreshed.push(c);
            }
          },
        },
      }
    );
    // getClaims 本地验签（见 lib/supabaseServer.ts 的 getSessionUser），一次 1~3ms
    const { data } = await supabase.auth.getClaims();
    authUid = (data?.claims?.sub as string | undefined) ?? null;
    // 先认「是不是管理员」（能不能进），再定「以谁的身份」（标题旁边的下拉，谁都能切）
    adminId = pickAdminIdentity(adminIdFromClaims(data?.claims), chosen);
  }

  if (isAdminPath(path) && !adminId && !fakeLogin) {
    if (req.method === "GET" || req.method === "HEAD") {
      const login = publicUrl("/login/admin", req.headers);
      login.searchParams.set("next", path + req.nextUrl.search);
      return NextResponse.redirect(login);
    }
    return new NextResponse("需要管理员登录", { status: 401 });
  }

  // 浏览器自己带来的同名头先删掉，下游读到的只能是这儿验过的
  const headers = new Headers(req.headers);
  headers.delete(ADMIN_ID_HEADER);
  headers.delete(AUTH_UID_HEADER);
  if (adminId) headers.set(ADMIN_ID_HEADER, adminId);
  if (authUid) headers.set(AUTH_UID_HEADER, authUid);

  const res = NextResponse.next({ request: { headers } });
  for (const c of refreshed) res.cookies.set(c.name, c.value, c.options);
  return res;
}

export const config = {
  // 静态资源不过：没有要认人的，白白多一道
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
