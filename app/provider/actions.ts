"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { assignBlockReason } from "@/lib/assignable";
import { validateResourceEdit, deleteBlockReason } from "@/lib/resourceEdit";
import { cookies } from "next/headers";

import { bookedDaysFor, VIEW_COOKIES } from "./data";
import { clampProviderBandDays } from "@/lib/providerBoard";
import { isIsoDate } from "@/lib/timelineStart";

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
    // 删掉的资源物主那边就当它不存在，别让它还能被改
    .is("deleted_at", null)
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

// 删掉一个资源。**软删除** —— 只打一个 deleted_at 时间戳，行留在库里（迁移 0013）。
// 物主那边从此看不见它，admin 那边照常列得出来，删错了能捞回来。
//
// 界面上先走一步确认（?delete=1）：对物主来说这就是「删掉了」，不该手滑就没。
//
// 服务端这道拦截不能省：界面上已经排出去的资源根本不给显示删除入口，但那挡不住 curl。
export async function deleteResource(formData: FormData) {
  const providerId = await requireProvider();
  const id = formData.get("id") as string;

  // 认 provider_id，不是只认 id —— 否则换个 id 就能删别人的资源
  const { data: mine } = await supabase
    .from("resources")
    .select("id")
    .eq("id", id)
    .eq("provider_id", providerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mine) redirect("/provider?error=notmine");

  const booked = (await bookedDaysFor([id])).get(id) ?? [];
  if (deleteBlockReason(booked)) redirect(`/provider?edit=${id}&error=hasBookings`);

  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("provider_id", providerId);
  if (error) redirect(`/provider?edit=${id}&error=save`);

  revalidatePath("/provider");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/resources");
  redirect("/provider?deleted=1");
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
  // 提完回到原来看的那个资源、原来那个视图上，别把人的筛选和视图踢掉
  const card = text(formData, "card");
  const view = text(formData, "view");
  const back = `${card ? `&card=${card}` : ""}${view === "list" ? "&view=list" : ""}`;

  const { data: sup } = await supabase
    .from("resources")
    .select(
      "id, status, deleted_at, holder_name, holder_gender, item_type, date_range_start, date_range_end"
    )
    .eq("id", resourceId)
    .eq("provider_id", providerId)
    .is("deleted_at", null)
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

// 日历怎么看：每行几天、从哪天开始。存 cookie（见 data.ts 里那段为什么不存库）。
//
// 一年的有效期：这是个偏好不是会话状态，下次进来还该是他调好的样子。
export async function saveViewSettings(formData: FormData) {
  const jar = cookies();
  const opts = { path: "/", maxAge: 31536000 } as const;

  jar.set(VIEW_COOKIES.bandDays, String(clampProviderBandDays(text(formData, "band_days"))), opts);

  // 留空 = 回到默认起点。填了但不是真实存在的日子，也当没填 ——
  // 与其让日历从一个说不清的地方开始，不如回默认
  const start = text(formData, "start");
  if (isIsoDate(start)) jar.set(VIEW_COOKIES.start, start, opts);
  else jar.set(VIEW_COOKIES.start, "", { path: "/", maxAge: 0 });

  const card = text(formData, "card");
  const view = text(formData, "view");
  const q = new URLSearchParams();
  if (card) q.set("card", card);
  if (view === "list") q.set("view", view);
  redirect(q.toString() ? `/provider?${q}` : "/provider");
}
