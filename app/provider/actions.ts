"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { validateResourceEdit, deleteBlockReason } from "@/lib/resourceEdit";
import { cookies } from "next/headers";

import { bookedDaysFor } from "./data";
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

  // 联系方式是人身上的（people），不在 providers 这张身份表上（0017）
  const { error } = await supabase
    .from("people")
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

// 提意向那条路**不在这儿** —— 它是个 Route Handler（app/provider/propose/route.ts），
// 校验和写库在 app/provider/proposeIntent.ts。Server Action 末尾的 redirect 会把整个
// /provider 先渲染完才回响应（实测 2 秒多），挂在「点一下资源名」的关键路径上太冤。

// 日历怎么看那两个设置**不在这儿**：cookie 由客户端直接写（app/provider/ViewSettings.tsx），
// 写完 router.refresh()。原来是个 Server Action + redirect —— redirect 要把整个 /provider
// 渲染完才回响应，还会把界面上换过的资源、切过的视图一起冲掉（那些现在是组件状态）。
