import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { STATUS_LABELS } from "@/lib/orderStatus";
import { bulkSetRejection, normalizeIds } from "@/lib/bulkStatus";

// 一次把选中的一批订单改成同一个状态。
//
//
// 服务端必须自己校验能不能设这个状态，不能只靠界面把选项藏起来——跟分配的
// 三条校验一个道理，界面藏按钮不算数。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const ids = normalizeIds(body.order_ids);
  if (ids.length === 0) {
    return NextResponse.json({ error: "没有选中任何订单" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUS_LABELS[status]) {
    return NextResponse.json({ error: "未知状态" }, { status: 400 });
  }
  const rejection = bulkSetRejection(status);
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 400 });
  }

  // 带 select 回来，好知道**实际**改了几单：选中集是客户端攒的，中间可能有单子
  // 已经被别人删了。返回真实条数，界面就能如实说「改了 7 单」而不是「改了 10 单」。
  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .in("id", ids)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = data?.length ?? 0;

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");

  return NextResponse.json({
    ok: true,
    updated,
    // 选中了但没改到的（已经被删掉了），界面据此提示
    missing: ids.length - updated,
  });
}
