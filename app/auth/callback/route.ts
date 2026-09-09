import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/customerClaim";

// 邮件里那条 magic link 点进来落在这里：拿 URL 上的 code 换 session 写进 cookie，
// 顺手把这个 auth 用户跟 customers 表对上，然后跳去 /customer。
//
// 这一步必须是 Route Handler，不能是页面：Server Component 里写不了 cookie。
export async function GET(req: NextRequest) {
  // Supabase 拒掉这条链接时（过期、已经用过、被邮件客户端预取消费掉了），
  // 是带着 error/error_code 回来的，不是「没有 code」。分开处理，否则用户看到的
  // 是「链接不完整」——完全是另一回事，他会以为是我们把链接发坏了。
  if (req.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/customer/login?error=expired", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/customer/login?error=nocode", req.url));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/customer/login?error=expired", req.url));
  }

  try {
    await claimCustomer(data.user.id, data.user.email ?? null);
  } catch {
    // 认领失败不该把人挡在门外：session 已经建好了，/customer 那边会再兜一次底
  }

  return NextResponse.redirect(new URL("/customer", req.url));
}
