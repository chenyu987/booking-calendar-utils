import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { assignBlockReason } from "@/lib/assignable";
import { computeNeed, syncedAssignmentStatus } from "@/lib/assignment";

// 配一个资源 / 撤一个资源。
//
// 原来这两件事是 Server Action，末尾 redirect() 回排期总览。redirect() 会**先把
// 整个目标页面在服务端渲染完**才回响应——实测这一页渲染一次要 0.6~1.3 秒，
// 白白挂在每次分配的关键路径上。分配是这个后台用得最多的动作，等得最冤。
//
// 改成 Route Handler 之后：写完库就返回，整页渲染交给客户端的 router.refresh()
// 在后台跑，不挡着人。建单/删单当初就是这么修的，同一个套路。
//
// **校验一条都不能少地留在服务端**——界面把按钮藏起来不算数（CLAUDE.md）。
// 失败返回 400 + 中文原因，客户端原样显示给人看，不吞掉。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const resourceId = typeof body.resource_id === "string" ? body.resource_id : "";
  const op = body.op === "remove" ? "remove" : "add";
  if (!orderId || !resourceId) {
    return NextResponse.json({ error: "缺 order_id 或 resource_id" }, { status: 400 });
  }

  try {
    if (op === "add") {
      await addAssignment(orderId, resourceId);
    } else {
      await removeAssignment(orderId, resourceId);
    }
  } catch (e: any) {
    // 校验没过是「正常的拒绝」，不是崩溃，用 400 让客户端好好显示出来
    return NextResponse.json({ error: e.message ?? "操作失败" }, { status: 400 });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  return NextResponse.json({ ok: true });
}

async function addAssignment(orderId: string, resourceId: string) {
  // 四个查询一次并发拿齐（校验用的 + 算配齐进度用的），插入后就不用再倒回去查一趟
  const [{ data: ord }, { data: sup }, { data: existingRows }, { data: otherAssignments }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("demand_days, male_count, female_count, status, location")
        .eq("id", orderId)
        .single(),
      supabase
        .from("resources")
        .select("id, date_range_start, date_range_end, status, holder_name, holder_gender, item_type")
        .eq("id", resourceId)
        .single(),
      supabase
        .from("order_assignments")
        .select("resources(id, holder_gender)")
        .eq("order_id", orderId),
      supabase
        .from("order_assignments")
        .select("orders(demand_days)")
        .eq("resource_id", resourceId)
        .neq("order_id", orderId),
    ]);

  if (!ord || !sup) throw new Error("订单或资源不存在");

  // 校验走 lib/assignable.ts 那一份 —— 匹配台的 chosen 和物主提意向用的是同一个
  const already = (existingRows ?? []).map((r: any) => r.resources).filter(Boolean);
  const blocked = assignBlockReason({
    order: ord,
    resource: sup,
    alreadyAssigned: already,
    resourceBookedDays: (otherAssignments ?? []).flatMap(
      (r: any) => r.orders?.demand_days ?? []
    ),
  });
  if (blocked) throw new Error(blocked);

  const { error } = await supabase
    .from("order_assignments")
    .insert({ order_id: orderId, resource_id: resourceId });
  if (error) throw new Error(error.message);

  // 注意：不改 resources.status。资源被占了哪几天是算出来的，不是存出来的。

  // 配齐了就把订单推进到 itemAssigned —— 用插入前已经查到的数据本地算，不用再查一次
  const need = computeNeed(ord, [
    ...(existingRows ?? []).map((r: any) => r.resources),
    { holder_gender: sup.holder_gender },
  ]);
  if (need.isComplete && ord.status === "created") {
    await supabase.from("orders").update({ status: "itemAssigned" }).eq("id", orderId);
  }
}

async function removeAssignment(orderId: string, resourceId: string) {
  const { error } = await supabase
    .from("order_assignments")
    .delete()
    .eq("order_id", orderId)
    .eq("resource_id", resourceId);
  if (error) throw new Error(error.message);

  // 不用改 resources.status —— 删掉这条分配记录，那几天自然就空出来了

  // 撤了这个资源可能就不配齐了，itemAssigned 要回退到 created（人工推进的后续状态不动）
  const [{ data: ord }, { data: rows }] = await Promise.all([
    supabase
      .from("orders")
      .select("male_count, female_count, status")
      .eq("id", orderId)
      .single(),
    supabase
      .from("order_assignments")
      .select("resources(holder_gender)")
      .eq("order_id", orderId),
  ]);
  if (!ord) return;

  const need = computeNeed(
    ord,
    (rows ?? []).map((r: any) => r.resources)
  );
  const nextStatus = syncedAssignmentStatus(ord.status, need);
  if (nextStatus !== ord.status) {
    await supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
  }
}
