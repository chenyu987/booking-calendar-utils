"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { assignBlockReason } from "@/lib/assignable";
import { validateResourceEdit } from "@/lib/resourceEdit";
import { bookedDaysFor } from "./data";

// 物主主页上的三个写入口。放一块儿是因为它们共用同一套身份校验：
// **认 provider_id，不是只认 id** —— 只按 id 更新的话，换个 id 就能改别人的东西。

const text = (formData: FormData, k: string) =>
  ((formData.get(k) as string) ?? "").trim();

async function requireProvider(): Promise<string> {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  return claimProvider(user.id, user.email ?? null);
}

// 自助改资源信息。校验在 lib/resourceEdit.ts，**服务端拦**——
// 界面上性别禁掉了、日期给了 min/max，但那些 curl 一下全绕得过去。
export async function saveResource(formData: FormData) {
  const providerId = await requireProvider();
  const id = formData.get("id") as string;

  const { data: current } = await supabase
    .from("resources")
    .select("id, holder_gender")
    .eq("id", id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!current) redirect("/provider");

  const next = {
    itemType: text(formData, "item_type"),
    holderName: text(formData, "holder_name"),
    holderGender: text(formData, "holder_gender"),
    dateRangeStart: text(formData, "date_range_start"),
    dateRangeEnd: text(formData, "date_range_end"),
    status: text(formData, "status"),
  };
  const booked = (await bookedDaysFor([id])).get(id) ?? [];
  const bad = validateResourceEdit(next, current, booked);
  if (bad) redirect(`/provider?edit=${id}&error=${bad}`);

  const { error } = await supabase
    .from("resources")
    .update({
      item_type: next.itemType,
      holder_name: next.holderName,
      holder_gender: next.holderGender,
      holder_date_of_birth: text(formData, "holder_date_of_birth") || null,
      // 留空 = 这一头不设限，别写成空字符串
      date_range_start: next.dateRangeStart || null,
      date_range_end: next.dateRangeEnd || null,
      status: next.status,
    })
    .eq("id", id)
    .eq("provider_id", providerId);
  if (error) redirect(`/provider?edit=${id}&error=save`);

  revalidatePath("/provider");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/resources");
  redirect("/provider?saved=1");
}

// 联系方式。**聊天必填** —— 配到客户之后全靠聊天找人，没有聊天这个资源就等于挂不出去。
export async function saveContact(formData: FormData) {
  const providerId = await requireProvider();

  const chat = text(formData, "chat");
  if (!chat) redirect("/provider?edit=contact&error=chat");

  const { error } = await supabase
    .from("providers")
    .update({
      first_name: text(formData, "first_name") || null,
      chat,
      phone_number: text(formData, "phone_number") || null,
    })
    .eq("id", providerId);
  if (error) redirect("/provider?edit=contact&error=save");

  revalidatePath("/provider");
  revalidatePath("/admin/providers");
  redirect("/provider?saved=1");
}

// 提一个意向。**意向不是事实** —— 写进 matches，管理员确认之后才变成 order_assignments。
//
// 这里跑的是跟分配一模一样的那套校验（lib/assignable.ts）。原来这条路只校验了
// 「这个资源是不是你的」，界面上过滤了但服务端没有 —— curl 一下能给任何单提任何意向。
// 坏意向变不成坏分配（真闸门在管理员把 match 改成 chosen 那一步），但入口从列表
// 变成日历之后点起来容易多了，垃圾意向会淹掉匹配台。
export async function proposeMatch(formData: FormData) {
  const providerId = await requireProvider();

  const orderId = (formData.get("order_id") as string) ?? "";
  const resourceId = (formData.get("resource_id") as string) ?? "";
  // 提完回到原来看的那个资源上，别把人的筛选踢掉
  const card = text(formData, "card");
  const back = card ? `&card=${card}` : "";

  const { data: sup } = await supabase
    .from("resources")
    .select("id, status, holder_name, holder_gender, item_type, date_range_start, date_range_end")
    .eq("id", resourceId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!sup) redirect(`/provider?error=notmine${back}`);

  const [{ data: ord }, { data: assignedRows }, { data: dup }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, location, demand_days, male_count, female_count")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_assignments")
      .select("resources(id, holder_gender)")
      .eq("order_id", orderId),
    supabase
      .from("matches")
      .select("id")
      .eq("order_id", orderId)
      .eq("resource_id", resourceId)
      .in("status", ["proposed", "allowed", "chosen"])
      .maybeSingle(),
  ]);
  if (!ord || ord.status !== "created") redirect(`/provider?error=blocked${back}`);
  // 同一个资源对同一单提两次没有意义，只会把匹配台刷满
  if (dup) redirect(`/provider?error=dup${back}`);

  const booked = (await bookedDaysFor([resourceId], orderId)).get(resourceId) ?? [];
  const blocked = assignBlockReason({
    order: ord,
    resource: sup,
    alreadyAssigned: (assignedRows ?? []).map((r: any) => r.resources).filter(Boolean),
    resourceBookedDays: booked,
  });
  if (blocked) redirect(`/provider?error=blocked${back}`);

  // Provider 从 resource 推得出来，不重复存
  const { error } = await supabase
    .from("matches")
    .insert({ order_id: orderId, resource_id: resourceId, status: "proposed" });
  if (error) redirect(`/provider?error=save${back}`);

  revalidatePath("/admin/matches");
  revalidatePath("/provider");
  redirect(`/provider?proposed=1${back}`);
}
