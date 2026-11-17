import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { computeNeed, syncedAssignmentStatus } from "@/lib/assignment";
import { planDropPerson } from "@/lib/dropPerson";
import { rescaleAmount } from "@/lib/pricing";

// 「少几个人」（分配浮动条的「⋯」菜单，一次可以勾好几个）：人数减掉、总价按比例减、配给这几个人的资源退回去。
// 判断只有一份，在 lib/dropPerson.ts 的 planDropPerson（菜单列哪几项也用它那一家）。
//
// **先验后写**：所有校验在任何写库之前。写的顺序是先撤销分配、再改人数金额 ——
// 万一第二步没写上，留下的是「男1/2」这种缺资源的样子（色块上看得见、配一张就补回来），
// 而不是反过来的「资源比人多」。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }
  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  if (!orderId) return NextResponse.json({ error: "缺 order_id" }, { status: 400 });

  const [{ data: ord, error: ordErr }, { data: rows, error: rowsErr }] = await Promise.all([
    supabase
      .from("orders")
      .select("male_count, female_count, demand_days, amount, status")
      .eq("id", orderId)
      .maybeSingle(),
    supabase.from("order_assignments").select("resource_id, resources(id, holder_gender)").eq("order_id", orderId),
  ]);
  if (ordErr || rowsErr) {
    return NextResponse.json({ error: (ordErr ?? rowsErr)!.message }, { status: 500 });
  }
  if (!ord) return NextResponse.json({ error: "这一单不存在" }, { status: 400 });

  const cards = (rows ?? []).map((r: any) => ({
    id: r.resource_id as string,
    holder_gender: (r.resources?.holder_gender ?? null) as string | null,
  }));
  const plan = planDropPerson(ord, cards, body.drops);
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 });

  const days = (ord.demand_days ?? []).length;
  const oldParty = (ord.male_count ?? 0) + (ord.female_count ?? 0);
  const amount = rescaleAmount(
    ord.amount != null ? Number(ord.amount) : null,
    { days, party: oldParty },
    { days, party: plan.male + plan.female }
  );
  const remaining = cards.filter((c) => !plan.removeResourceIds.includes(c.id));
  // 少了人可能反倒配齐了（少的是没分配的那个）→ created 推到 itemAssigned；人工推进的后续状态不动
  const status = syncedAssignmentStatus(
    ord.status,
    computeNeed({ male_count: plan.male, female_count: plan.female }, remaining)
  );

  if (plan.removeResourceIds.length > 0) {
    const { error } = await supabase
      .from("order_assignments")
      .delete()
      .eq("order_id", orderId)
      .in("resource_id", plan.removeResourceIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("orders")
    .update({ male_count: plan.male, female_count: plan.female, amount, status })
    .eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/matches");
  return NextResponse.json({ ok: true, male: plan.male, female: plan.female, amount, at: Date.now() });
}
