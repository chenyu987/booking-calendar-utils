import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { replaceDayRun } from "@/lib/dates";
import { rescaleAmount } from "@/lib/pricing";
import { resizeConflictReason, type Booking } from "@/lib/doubleBooking";

// 拖色块边缘改日期。
//
// 原来是 Server Action，改成 Route Handler 有两个原因：
//  1. **报错要说人话。** 生产环境 Next 会把 Server Action 抛的错换成一句笼统的
//     「服务器出错」，而这里最要紧的信息恰恰是那句「sara lee 在 9/11 已经配给
//     别的订单了」——不说清是哪个资源哪一天，人根本不知道该改什么。
//  2. 跟分配/撤销分配那条路一致：写完就返回，整页重渲染交给客户端的 router.refresh()。
//
// **「同一个资源同一天不能配给两个订单」这条校验必须在这儿。** 它以前只拦分配那条路，
// 拖日期这条路完全没拦 —— 把一个配好资源的单子往前拖一天撞上同一个资源在别单的日子，
// 就这么写进库了，而这种数据两条分配路径都造不出来。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const runStart = typeof body.run_start === "string" ? body.run_start : "";
  const runEnd = typeof body.run_end === "string" ? body.run_end : "";
  const newStart = typeof body.new_start === "string" ? body.new_start : "";
  const newEnd = typeof body.new_end === "string" ? body.new_end : "";
  if (!orderId || !runStart || !runEnd || !newStart || !newEnd) {
    return NextResponse.json({ error: "参数不全" }, { status: 400 });
  }

  const { data: ord } = await supabase
    .from("orders")
    .select("demand_days, amount")
    .eq("id", orderId)
    .single();
  if (!ord) return NextResponse.json({ error: "订单不存在" }, { status: 400 });

  // 只替换被拖的这一段连续日期，订单里其它不连续的日期段保持不动
  const merged = replaceDayRun(ord.demand_days ?? [], runStart, runEnd, newStart, newEnd);

  const { data: mine } = await supabase
    .from("order_assignments")
    .select("resource_id, resources(holder_name)")
    .eq("order_id", orderId);
  const assigned = ((mine ?? []) as any[]).map((r) => ({
    resourceId: r.resource_id,
    holderName: r.resources?.holder_name ?? null,
  }));

  if (assigned.length > 0) {
    const { data: others } = await supabase
      .from("order_assignments")
      .select("resource_id, orders(demand_days)")
      .in(
        "resource_id",
        assigned.map((a) => a.resourceId)
      )
      .neq("order_id", orderId);
    const otherBookings = new Map<string, Booking[]>();
    for (const r of (others ?? []) as any[]) {
      otherBookings.set(r.resource_id, [
        ...(otherBookings.get(r.resource_id) ?? []),
        { orderId: "", days: r.orders?.demand_days ?? [] },
      ]);
    }
    const reason = resizeConflictReason(merged, assigned, otherBookings);
    // 拒绝而不是照写：这种数据分配那条路根本造不出来，让它从这条路溜进去
    // 等于在库里留一个只有靠人肉发现的坑
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }

  // 总价跟着天数按比例重算：人数没变，两头填一样的就约掉了
  const newAmount = rescaleAmount(
    ord.amount != null ? Number(ord.amount) : null,
    { days: (ord.demand_days ?? []).length, party: 1 },
    { days: merged.length, party: 1 }
  );

  const { error } = await supabase
    .from("orders")
    .update({ demand_days: merged, amount: newAmount })
    .eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  return NextResponse.json({ ok: true });
}
