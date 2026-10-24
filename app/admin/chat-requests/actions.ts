"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { REQUEST_NOTE_MAX, parseRequestStatus } from "@/lib/chatRequests";

// 需求页的「保存」：改跟进状态和备注。单独放一个文件，tests/ 才能直接 import 来测。
// 谁改的不用这里记：0029 给 chat_requests 挂了 log_change，改动记录里有。

function back(raw: FormDataEntryValue | null): string {
  // 只接受本页的筛选参数，不让表单把人带去别处
  const status = parseRequestStatus(raw) ?? (raw === "all" ? "all" : null);
  return status ? `/admin/chat-requests?status=${status}` : "/admin/chat-requests";
}

export async function updateRequest(formData: FormData) {
  const to = back(formData.get("back"));
  const id = String(formData.get("id") ?? "");
  const status = parseRequestStatus(formData.get("status"));
  if (!id || !status) redirect(`${to}${to.includes("?") ? "&" : "?"}error=bad`);

  const note = String(formData.get("admin_note") ?? "").trim().slice(0, REQUEST_NOTE_MAX);
  const { error } = await supabase
    .from("chat_requests")
    .update({ status, admin_note: note || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/chat-requests");
  redirect(to);
}
