import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setBandDays } from "@/lib/bandDaysSetting";
import { clampBandDays } from "@/lib/bandDays";

// 拖右边那根条改「每行几天」时打这里。
//
// 存的是 cookie（每台电脑各记各的，见 lib/bandDaysSetting.ts）。还是走服务端写：
// 设置弹框也改这个值，夹范围、挡坏类型只该有一份。
// 用 Route Handler 不用 Server Action：跟分配那边同一个理由 —— 写完就返回，
// 整页重渲染交给客户端的 router.refresh() 在后台跑，不挡着手上的操作。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  // **先看类型再 Number()**：Number(null) 是 0、Number([]) 也是 0，都能过
  // Number.isFinite，然后被 clamp 成 3 天悄悄存进去 —— 一个坏请求把「每行几天」
  // 改成最窄，还什么都不报。集成测试就是抓着这个的。
  const raw =
    typeof body.days === "number"
      ? body.days
      : typeof body.days === "string" && body.days.trim() !== ""
        ? Number(body.days)
        : NaN;
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: "days 不是数字" }, { status: 400 });
  }

  await setBandDays("overview", clampBandDays(raw));

  revalidatePath("/admin/overview");
  return NextResponse.json({ ok: true });
}
