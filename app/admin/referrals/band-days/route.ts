import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setReferralBandDays } from "@/lib/appSettings";
import { clampBandDays } from "@/lib/bandDays";

// 拖返点日历右边那根条改「每行几天」时打这里。
//
// 跟排期总览那条（app/admin/overview/band-days）是同一个形状，但**各存各的 key** ——
// 两张不同的表、不同的用法，不该互相牵连。
//
// 用 Route Handler 不用 Server Action：写完就返回，整页重渲染交给客户端的
// router.refresh() 在后台跑，不挡着手上的拖拽。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  // **先看类型再 Number()**：Number(null) 是 0、Number([]) 也是 0，都能过
  // Number.isFinite，然后被 clamp 成最窄的 3 天悄悄存进去 —— 一个坏请求把日历
  // 压成最窄，还什么都不报。总览那条就是被这个咬过，这儿照着来
  const raw =
    typeof body.days === "number"
      ? body.days
      : typeof body.days === "string" && body.days.trim() !== ""
        ? Number(body.days)
        : NaN;
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: "days 不是数字" }, { status: 400 });
  }

  try {
    await setReferralBandDays(clampBandDays(raw));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "没存上" }, { status: 500 });
  }

  revalidatePath("/admin/referrals");
  return NextResponse.json({ ok: true });
}
