"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, personSpread } from "@/lib/people";
import { mergeBlockReason, type ClaimPerson } from "@/lib/selfClaim";
import { addressFromFormData } from "@/lib/address";
import { parseAdminIds } from "@/lib/admins";
import { providerReturnPath } from "@/lib/providerFilter";
import { loadAdmins, saveContacts } from "@/lib/personContacts";

// Provider 管理的写入口。放在单独的文件里（不内联在 page.tsx）是为了 tests/ 能直接调。
//
// 「谁的客人」（person_contacts，0018）跟 Customer 管理同一套：挂在人身上，勾几个存几行，
// **认不出来的管理员 id 整个拒掉**（parseAdminIds）—— 悄悄丢掉会被当成「取消勾选」把原来的删了。
// 2026-10-30 用户定的：物主也分是谁的客人（推翻了 10/19「物主算所有管理员共有」那条）

export async function createProvider(formData: FormData) {
  // 昵称 + 账号必填（认人、显示、联系都靠它）；电话选填。
  // 称呼（first_name）留给以后注册的用户自己填（0020）
  const chatName = (formData.get("chat_name") as string)?.trim();
  const chatId = (formData.get("chat_id") as string)?.trim();
  if (!chatName || !chatId) throw new Error("昵称和账号必填");
  // 地址（0028）选填，跟编辑同一份读法；国家只认下拉里的
  const parsed = addressFromFormData(formData);
  if ("error" in parsed) throw new Error("国家只能从下拉里选");
  // 「谁的客人」先验再写：认不出来的管理员在建人之前就拦住，不留一个建了一半的人
  const contacts = parseAdminIds(formData.getAll("contact"), await loadAdmins());
  if (!contacts.ok) throw new Error(contacts.reason);

  const id = await createPerson("provider", {
    chat_name: chatName,
    chat_id: chatId,
    phone_number: (formData.get("phone_number") as string)?.trim() || null,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
    ...parsed.address,
  });
  await saveContacts(id, contacts.ids);
  revalidatePath("/admin/providers");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
}

export async function updateProvider(formData: FormData) {
  // 编辑的全是人身上的字段（people，0017）—— 这个人要是也是客户，Customer 管理那边跟着变。
  // 不碰称呼（first/last name）：那是注册用户自己填的，后台不改（0020）
  const id = formData.get("id") as string;
  const chatName = (formData.get("chat_name") as string)?.trim();
  if (!chatName) throw new Error("昵称必填");
  const parsed = addressFromFormData(formData);
  if ("error" in parsed) throw new Error("国家只能从下拉里选");
  // 先验后写：管理员认不出来就一个字都不改
  const admins = await loadAdmins();
  const contacts = parseAdminIds(formData.getAll("contact"), admins);
  if (!contacts.ok) throw new Error(contacts.reason);

  const { error } = await supabase
    .from("people")
    .update({
      chat_name: chatName,
      chat_id: (formData.get("chat_id") as string)?.trim() || null,
      phone_number: (formData.get("phone_number") as string)?.trim() || null,
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      status: formData.get("status") as string,
      note: (formData.get("note") as string)?.trim() || null,
      ...parsed.address,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // 只加新勾的、只删取消勾的（contactsDiff）。人也是客户的话，Customer 管理那边跟着变 —— 挂在人身上
  await saveContacts(id, contacts.ids);

  revalidatePath("/admin/providers");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
  // 存完退出编辑状态，回到筛过的列表（不是整张表）—— 筛选带在隐藏的 back 里，重新解析一遍再拼
  redirect(providerReturnPath(String(formData.get("back") ?? ""), admins));
}

// 「可能是老物主」那块的「是同一个人，合并」。跟 Customer 管理的 mergeCustomer 一个路子：
// drop = 自己登录进来新建的那个人，keep = 管理员录的老物主。
// 先验后写：只许合页面上**现在还提示着的那一对**（lib/selfClaim.ts 的 mergeBlockReason）——
// 直接 POST 两个 id 的话，不拦就能把任意两个人揉成一个。真正的合并在库函数 merge_person（0032），
// 一个事务，资源（resources）跟着挪过去
export async function mergeProvider(formData: FormData) {
  const dropId = String(formData.get("drop") ?? "");
  const keepId = String(formData.get("keep") ?? "");

  // 跟页面算提示用的是同一批人（所有物主），对上多个就当没对上这条才跟页面一致
  const { data, error } = await supabase
    .from("providers")
    .select(`id, ${personSpread("chat_name, chat_id, auth_user_id")}`);
  if (error) redirect(`/admin/providers?merge_error=${encodeURIComponent("读不到物主，没合：" + error.message)}`);

  const reason = mergeBlockReason(dropId, keepId, (data ?? []) as ClaimPerson[]);
  if (reason) redirect(`/admin/providers?merge_error=${encodeURIComponent(reason)}`);

  const { error: mergeError } = await supabase.rpc("merge_person", { keep_id: keepId, drop_id: dropId });
  if (mergeError) redirect(`/admin/providers?merge_error=${encodeURIComponent("没合上：" + mergeError.message)}`);

  revalidatePath("/admin/providers");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/matches");
  revalidatePath("/provider");
  redirect("/admin/providers");
}
