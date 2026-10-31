import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { daysBetween, shiftDays } from "@/lib/dates";
import { resizeConflictReason, type Booking } from "@/lib/doubleBooking";
import { coversOrder, formatValidity } from "@/lib/resourceStatus";

// 按住色块拖到别的日子：整单所有日期一起平移。
//
// 跟拖边框（resize/route.ts）是两件事：那条只改被拖的那一段、天数会变、总价跟着重算；
// 这条天数不变，**总价不动**，不连续的单挪完间隔也不变。
//
// 参数是「从哪天拿起、放到哪天」，平移多少天由服务端算 —— 不收客户端算好的新日期：
// 页面上那份 demand_days 可能是旧的（别人刚改过），按库里现在的日期平移才不会把别人的改动冲掉。
//
// 改 demand_days 的入口，分配那几条校验要问一遍（CLAUDE.md「分配的三条校验」）：
//  - 挂牌状态：资源已经配上了，不因为挪日期去重审它 —— 跟拖边框那条一样
//  - **有效期**：挪过去的日子卡得有效。拖边框那条没拦这个，这条拦
//  - **同一个资源同一天两单**：跟拖边框同一个判断（resizeConflictReason）
// 拦住时一天都不写。
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const fromDay = typeof body.from_day === "string" ? body.from_day : "";
  const toDay = typeof body.to_day === "string" ? body.to_day : "";
  if (!orderId || !ISO_DAY.test(fromDay) || !ISO_DAY.test(toDay)) {
    return NextResponse.json({ error: "参数不全" }, { status: 400 });
  }
  const delta = daysBetween(fromDay, toDay);
  if (!Number.isFinite(delta)) {
    return NextResponse.json({ error: "日期不对" }, { status: 400 });
  }

  const [{ data: ord }, { data: mine }] = await Promise.all([
    supabase.from("orders").select("demand_days").eq("id", orderId).single(),
    supabase
      .from("order_assignments")
      .select("resource_id, resources(holder_name, validity)")
      .eq("order_id", orderId),
  ]);
  if (!ord) return NextResponse.json({ error: "订单不存在" }, { status: 400 });
  if (delta === 0) return NextResponse.json({ ok: true, at: Date.now() });

  const newDays = shiftDays(ord.demand_days ?? [], delta);
  const assigned = ((mine ?? []) as any[]).map((r) => ({
    resourceId: r.resource_id as string,
    holderName: (r.resources?.holder_name ?? null) as string | null,
    resource: r.resources ?? {},
  }));

  // 判断依据是「挪过去那几天资源有没有效」，跟分配同一个 coversOrder
  for (const a of assigned) {
    if (!coversOrder(a.resource, newDays)) {
      return NextResponse.json(
        {
          error: `${a.holderName ?? "这个资源"} 的有效期是 ${formatValidity(a.resource)}，盖不住挪过去的日期`,
        },
        { status: 400 }
      );
    }
  }

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
    const reason = resizeConflictReason(newDays, assigned, otherBookings);
    if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  }

  const { error } = await supabase
    .from("orders")
    .update({ demand_days: newDays })
    .eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  // 返点按活动日落不落在窗口里算，日子挪了那边跟着变
  revalidatePath("/admin/referrals");
  revalidatePath("/admin/matches");
  // 客户端拿它等「存完之后才开始查库」的那次渲染（main[data-rendered-at]），到了才撤预览
  return NextResponse.json({ ok: true, at: Date.now() });
}
