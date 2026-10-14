import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { todayIso } from "@/lib/dates";
import { parseCustomerEdit } from "@/lib/customerEdit";
import { parseAdminIds } from "@/lib/admins";
import { loadAdmins, saveContacts } from "@/lib/personContacts";

// Customer 编辑的保存，**唯一一份**：表单的 Server Action（JS 没跑起来时走它）和
// 客户端后台存的那个 Route Handler（save/route.ts）都调它。
//
// 先验再写：表单校验、「谁的客人」认不认得出来都过了才动库，拦住时一个字都不写。
export async function saveCustomerEdit(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "缺 id" };

  const parsed = parseCustomerEdit((k) => formData.get(k) as string | null, todayIso());
  if ("error" in parsed) return { error: parsed.error };

  const contacts = parseAdminIds(formData.getAll("contact"), await loadAdmins());
  if (!contacts.ok) return { error: contacts.reason };

  // 编辑的全是人身上的字段（people，0017）—— 这个人要是也是物主，Provider 管理那边跟着变
  const { error } = await supabase.from("people").update(parsed.values).eq("id", id);
  if (error) return { error: error.message };
  try {
    await saveContacts(id, contacts.ids);
  } catch (e: any) {
    return { error: `「谁的客人」没存上：${e.message}` };
  }

  // 客户名字显示在这些页面上
  for (const p of ["/admin/customers", "/admin/providers", "/admin/overview", "/admin/orders", "/admin/matches", "/admin/referrals", "/admin/payments"]) {
    revalidatePath(p);
  }
  return { ok: true };
}
