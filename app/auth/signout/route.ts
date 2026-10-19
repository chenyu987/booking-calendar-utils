import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { publicUrl } from "@/lib/publicUrl";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  // 从后台退出的回管理员登录页（admin 侧边栏那个表单带 ?as=admin），别的回客户 / 物主那个
  const to = req.nextUrl.searchParams.get("as") === "admin" ? "/login/admin" : "/login";
  return NextResponse.redirect(publicUrl(to, req.headers), { status: 303 });
}
