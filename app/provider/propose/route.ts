import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { proposeIntent, type ProposeError } from "../proposeIntent";

// 提一条意向。
//
// 原来是 Server Action，末尾 `redirect("/provider?proposed=1")`。**redirect 会先把
// 整个 /provider 在服务端渲染完才回响应** —— 这一页要查资源、查单、查分配、查意向，
// 实测一次 2~2.5 秒，白白挂在「点一下资源名」的关键路径上。
//
// 改成 Route Handler：写完库就返回，页面那边自己 `router.refresh()` 在后台更新，
// 按钮当场变成「已提」。排期总览的分配当初就是这么修的
// （app/admin/overview/assign/route.ts 开头那段写的是同一件事）。
const MESSAGES: Record<ProposeError, string> = {
  notmine: "这个资源不是你的",
  blocked: "这一单现在接不了了（可能刚被别人配上，或者日期对不上）",
  dup: "这个资源你已经对这一单提过意向了",
  save: "没存上，再试一次",
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const resourceId = typeof body.resource_id === "string" ? body.resource_id : "";

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  // 认领那一趟**不 await**，交给 proposeIntent 跟它那几个查询并着跑
  const bad = await proposeIntent(claimProvider(user.id, user.email ?? null), orderId, resourceId);
  if (bad) return NextResponse.json({ error: MESSAGES[bad] }, { status: 400 });

  revalidatePath("/provider");
  revalidatePath("/admin/matches");
  return NextResponse.json({ ok: true });
}
