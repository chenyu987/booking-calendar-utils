"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { mergeBlockReason, type ClaimPerson } from "@/lib/selfClaim";

// 「可能是老客人」那块的「是同一个人，合并」。drop = 自己登录进来新建的那个人，keep = 管理员录的老客人。
// 先验后写：只许合页面上**现在还提示着的那一对**（lib/selfClaim.ts 的 mergeBlockReason）——
// 直接 POST 两个 id 的话，不拦就能把任意两个人揉成一个。真正的合并在库函数 merge_person（0032），一个事务
export async function mergeCustomer(formData: FormData) {
  const dropId = String(formData.get("drop") ?? "");
  const keepId = String(formData.get("keep") ?? "");

  // 跟页面算提示用的是同一批人（所有客户），对上多个就当没对上这条才跟页面一致
  const { data, error } = await supabase
    .from("customers")
    .select(`id, ${personSpread("chat_name, chat_id, auth_user_id")}`);
  if (error) redirect(`/admin/customers?merge_error=${encodeURIComponent("读不到客户，没合：" + error.message)}`);

  const reason = mergeBlockReason(dropId, keepId, (data ?? []) as ClaimPerson[]);
  if (reason) redirect(`/admin/customers?merge_error=${encodeURIComponent(reason)}`);

  const { error: mergeError } = await supabase.rpc("merge_person", { keep_id: keepId, drop_id: dropId });
  if (mergeError) redirect(`/admin/customers?merge_error=${encodeURIComponent("没合上：" + mergeError.message)}`);

  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/referrals");
  revalidatePath("/customer");
  redirect(`/admin/customers?saved=${keepId}`);
}
