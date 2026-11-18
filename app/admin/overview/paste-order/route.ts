import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { currentAdminId } from "@/lib/adminSession";
import { addContact } from "@/lib/personContacts";
import { daysBetween, shiftDays } from "@/lib/dates";

// 排期总览「复制 / 粘贴」一单（像 Excel：点一单 Ctrl+C，点空格子 Ctrl+V）。
// 抄的是「订了什么」：同一个客人、地点、男女人数、几天（不连续的照原样的间隔）、总价。
// **不抄**：分配（同一个资源同一天配两单本来就不许，换了日子资源也未必有效 —— 新单从「未分配」开始）、
// 付款、状态（新单一律 created）、备注（备注里常写「给了150」这种只属于原单的事）。
//
// 参数是「抄哪一单、贴到哪天」，日子由服务端按库里现在的 demand_days 平移 ——
// 不收客户端算好的日期，页面上那份可能是旧的。
// 这单记在当前身份名下，客人也补到当前身份名下 —— 跟拖空白建单（createQuickOrder）一个规矩。
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }
  const fromId = typeof body.from_order_id === "string" ? body.from_order_id : "";
  const start = typeof body.start === "string" ? body.start : "";
  if (!fromId || !ISO_DAY.test(start) || Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
    return NextResponse.json({ error: "参数不全" }, { status: 400 });
  }

  const adminId = (await currentAdminId()) ?? "";
  const [{ data: src, error: srcErr }, { data: admin }] = await Promise.all([
    supabase
      .from("orders")
      .select("customer_id, location, male_count, female_count, demand_days, amount")
      .eq("id", fromId)
      .maybeSingle(),
    adminId
      ? supabase.from("admins").select("id").eq("id", adminId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  if (!src) return NextResponse.json({ error: "要复制的那一单已经不在了" }, { status: 400 });
  // 拦在任何写库之前（同 createQuickOrder）
  if (!admin?.id) {
    return NextResponse.json({ error: "还没选当前身份（排期总览标题旁边）" }, { status: 400 });
  }
  const days = [...((src.demand_days as string[] | null) ?? [])].sort();
  if (days.length === 0) return NextResponse.json({ error: "那一单没有日子，没法复制" }, { status: 400 });
  if (!src.customer_id) return NextResponse.json({ error: "那一单没有客人，没法复制" }, { status: 400 });

  await addContact(src.customer_id as string, admin.id as string);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: src.customer_id,
      admin_id: admin.id,
      location: src.location,
      male_count: src.male_count ?? 0,
      female_count: src.female_count ?? 0,
      demand_days: shiftDays(days, daysBetween(days[0], start)),
      amount: src.amount,
      status: "created",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  return NextResponse.json({ ok: true, id: order.id, admin_id: admin.id });
}
