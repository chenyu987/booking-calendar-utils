"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { deleteBlockReason } from "@/lib/resourceEdit";
import { bookedDaysFor } from "@/app/provider/data";
import { periodsFromFormData, serializeValidity } from "@/lib/validity";
import { RESOURCE_STATUSES } from "@/lib/resourceStatus";

// Resource 管理页的「删除」「恢复」和编辑那一行的「保存」。
//
// **删除是软删除**（迁移 0013）：只打 `deleted_at`，行留在库里。原来这里是真删 ——
// `order_assignments` / `matches` 对 resources 都是 `on delete cascade`，真删一张配过单的资源，
// 分配记录跟着没了，订单却还挂着「已分配」，到取资源那天才发现缺一个资源。物主那边早就是软删了，
// 只有这一处漏了。
//
// 两个动作单独放一个文件，是为了让 tests/ 能直接 import 来测（页面里内联的 "use server"
// 函数导不出来）。

function revalidateAll() {
  revalidatePath("/admin/resources");
  // 这几页都按 deleted_at 把资源排除在外 / 标出来，删了恢复了都得跟着变
  revalidatePath("/admin/overview");
  revalidatePath("/admin/matches");
  revalidatePath("/provider");
}

export async function deleteResource(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/resources");

  // 跟物主那条路同一道闸（lib/resourceEdit.ts）：已经排出去的不给删。
  // 软删了之后排期总览里它就消失了，订单却还挂着这个资源 —— 界面上已经不给这种资源
  // 显示删除按钮，这里拦的是 curl 和「两个人同时操作」
  const booked = (await bookedDaysFor([id])).get(id) ?? [];
  if (deleteBlockReason(booked)) redirect("/admin/resources?error=booked");

  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    // 已经删过的别再改时间戳 —— 「什么时候删的」应该是第一次删的时间
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function restoreResource(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/resources");

  // 恢复不用跑分配那几条校验：软删的时候分配记录一条都没动，恢复只是让它重新露面。
  // 删的时候就不许有排期，所以也不会恢复出一个撞车的资源
  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidateAll();
}

/**
 * 编辑那一行的「保存」（app/admin/resources/ResourceEditing.tsx）。
 *
 * 原来是页面里内联的 updateResource，存完 redirect 回列表 —— 编辑态靠 URL 上的 ?edit=，
 * 进出编辑都要服务端把整张表重画一遍（两百多个资源，2~6 秒）。现在编辑态在浏览器里切，
 * 存的时候不跳转：返回错误信息给那一行显示，成功了 revalidate，页面就地刷新数据，
 * 那一行自己退出编辑态。
 *
 * 只能改没删的资源：删了的资源页面上只给「恢复」，这里拦 curl。
 */
export async function saveResource(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "缺资源的 id" };
  const periods = periodsFromFormData(formData);
  if (periods === "dates") return { error: "有效期的结束日期不能早于开始日期" };
  const status = String(formData.get("status") ?? "");
  if (!(RESOURCE_STATUSES as readonly string[]).includes(status)) return { error: "挂牌状态不对" };

  const { data, error } = await supabase
    .from("resources")
    .update({
      provider_id: formData.get("provider_id") as string,
      item_type: formData.get("item_type") as string,
      holder_name: (formData.get("holder_name") as string)?.trim() || null,
      holder_gender: (formData.get("holder_gender") as string) || null,
      holder_date_of_birth: (formData.get("holder_date_of_birth") as string) || null,
      validity: serializeValidity(periods),
      status,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "这个资源不在了（或者已经删了），刷新看看" };

  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
  return {};
}
