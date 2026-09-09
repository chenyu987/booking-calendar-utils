import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { claimFor, homeFor, parseRole } from "@/lib/accountClaim";

// 邮件里那条 magic link 点进来落在这里。
//
// 现在登录走的是邮箱+密码（内置发信服务额度太小，验证码每测几次就发不出去），
// 所以这条路平时走不到。**故意留着**：等接了自己的 SMTP 想把验证码/魔法链接
// 打开，那是 Supabase 控制台里的一个开关加登录页几十行，不是重写。：拿 URL 上的 code 换 session 写进 cookie，
// 顺手把这个 auth 用户跟 customers 表对上，然后跳去 /customer。
//
// 这一步必须是 Route Handler，不能是页面：Server Component 里写不了 cookie。
export async function GET(req: NextRequest) {
  // Supabase 拒掉这条链接时（过期、已经用过、被邮件客户端预取消费掉了），
  // 是带着 error/error_code 回来的，不是「没有 code」。分开处理，否则用户看到的
  // 是「链接不完整」——完全是另一回事，他会以为是我们把链接发坏了。
  if (req.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=nocode", req.url));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  // 角色跟着链接来：物主入口发的信里带 ?as=provider
  const role = parseRole(req.nextUrl.searchParams.get("as"));
  try {
    await claimFor(role, data.user.id, data.user.email ?? null);
  } catch {
    // 认领失败不该把人挡在门外：session 已经建好了，/customer 那边会再兜一次底
  }

  // 重置密码的邮件把用户送到这里换 session，然后要接着去设新密码那一页。
  // 只认站内路径：next 是从 URL 来的，放任它跳外站就是个开放重定向漏洞。
  const next = req.nextUrl.searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    const target = new URL(next, req.url);
    if (role === "provider") target.searchParams.set("as", "provider");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL(homeFor(role), req.url));
}
