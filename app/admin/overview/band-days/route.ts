import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setOverviewBandDays } from "@/lib/appSettings";
import { clampBandDays } from "@/lib/bandDays";

// 拖右边那根条改「每行几天」时打这里。
//
// 这个值以前存 cookie（客户端一行代码就写了），现在存库，所以得走服务端。
// 用 Route Handler 不用 Server Action：跟分配那边同一个理由 —— 写完就返回，
// 整页重渲染交给客户端的 router.refresh() 在后台跑，不挡着手上的操作。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const raw = Number(body.days);
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: "days 不是数字" }, { status: 400 });
  }

  try {
    await setOverviewBandDays(clampBandDays(raw));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "没存上" }, { status: 500 });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/settings");
  return NextResponse.json({ ok: true });
}
