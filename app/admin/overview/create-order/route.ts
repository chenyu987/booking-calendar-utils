import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson } from "@/lib/people";
import { addContact } from "@/lib/personContacts";
import { currentAdminId } from "@/lib/adminSession";

// 排期总览拖空白建单（NewOrderSelector 的弹窗）。
//
// 原来是 page.tsx 里的 Server Action（createQuickOrder），2026-11-18 挪成 Route Handler：
// Server Action 里 revalidatePath 当前页，Next 会把整页重新渲染一遍顺着回包送回来 —— 一季一千八百单，
// 建一单就整页重画一次。挪过来以后写完库只回新单号，浏览器只拉这一单合进日历（liveData.ts），
// 跟粘贴（paste-order）同一个路子。逻辑一行没改，只是参数从 FormData 换成 JSON。
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "").trim();
  const customerName = str("customer_name");
  if (!customerName) return NextResponse.json({ error: "客人姓名不能为空" }, { status: 400 });

  const location = str("location") || null;
  const note = str("note");
  const maleCount = Number(body.male_count ?? 0) || 0;
  const femaleCount = Number(body.female_count ?? 0) || 0;
  const demandDays = Array.isArray(body.demand_days) ? (body.demand_days as unknown[]) : [];
  if (demandDays.length === 0) return NextResponse.json({ error: "日期不能为空" }, { status: 400 });
  if (demandDays.some((d) => typeof d !== "string" || !ISO_DAY.test(d))) {
    return NextResponse.json({ error: "日期不对" }, { status: 400 });
  }
  const amountRaw = body.amount === null || body.amount === undefined ? "" : String(body.amount).trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);
  if (amount !== null && !Number.isFinite(amount)) return NextResponse.json({ error: "金额不对" }, { status: 400 });

  // 当前身份（标题旁边那个下拉；没切过就是登录的那个人，middleware 定的）：这单的客人记成这个管理员的。
  // id 得在库里真有这个人。**跟找客人那条查询并排跑**，不多等一个来回
  const adminId = (await currentAdminId()) ?? "";
  const findAdmin = async () => {
    if (!adminId) return null;
    const { data } = await supabase.from("admins").select("id").eq("id", adminId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  // 同名客人复用，找不到就现建一个 —— 快速建单不打断流程去 Customer 页面。
  // 只在**客户**里找（!inner = 没有 customers 这一行的人不算）—— 同名的物主不该被顺手拉来下单
  const findCustomer = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, people!inner(chat_name)")
      .ilike("people.chat_name", customerName)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const [admin, existingCustomerId] = await Promise.all([findAdmin(), findCustomer()]);
  // 拦在任何写库之前。界面上没选身份时「创建」是灰的，这里拦的是旧页面和直接 POST
  if (!admin) {
    return NextResponse.json(
      { error: "还没选当前身份（排期总览标题旁边），选了才知道这个客人记在谁名下" },
      { status: 400 }
    );
  }

  // 建单弹窗里填的「客人」就是昵称（0020）
  const customerId = existingCustomerId ?? (await createPerson("customer", { chat_name: customerName }));
  // 老客人原来是别人加的也照样补上（别人的保留）。放在建单之前：这步失败就整个停住
  await addContact(customerId, admin);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      admin_id: admin,
      location,
      male_count: maleCount,
      female_count: femaleCount,
      demand_days: demandDays,
      amount,
      status: "created",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 备注存在 order_notes 里。填了才写；这一步失败不报错：单子已经建好了，备注可以进分配态重填
  if (note) {
    await supabase.from("order_notes").insert({ order_id: order.id, internal_note: note });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  return NextResponse.json({ ok: true, id: order.id, admin_id: admin });
}
