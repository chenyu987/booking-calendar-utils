"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { parseRequestPrice, setRequestPrices } from "@/lib/appSettings";
import {
  REQUEST_NOTE_MAX,
  parseBulkIds,
  parseGroupForm,
  parseRequestFilters,
  parseRequestStatus,
  requestFiltersQuery,
} from "@/lib/chatRequests";

// 需求页上的几个写操作。单独放一个文件，tests/ 才能直接 import 来测。
// 谁改的不用这里记：chat_requests / chat_groups 都挂了 log_change，改动记录里有。

const PAGE = "/admin/chat-requests";

/**
 * 存完回到原来那个筛选视图。表单里带的是当时地址栏的参数，**重新过一遍 parseRequestFilters 再拼**：
 * 不认识的参数、外站地址都进不了 redirect，表单不能把人带去别处。
 */
function back(formData: FormData, extra = ""): string {
  const raw = String(formData.get("back") ?? "");
  const sp = Object.fromEntries(new URLSearchParams(raw.replace(/^\?/, "")));
  const qs = requestFiltersQuery(parseRequestFilters(sp));
  if (!extra) return `${PAGE}${qs}`;
  return `${PAGE}${qs}${qs ? "&" : "?"}${extra}`;
}

export async function updateRequest(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = parseRequestStatus(formData.get("status"));
  if (!id || !status) redirect(back(formData, "error=bad"));

  const patch: { status: string; admin_note?: string | null } = { status: status! };
  if (formData.has("admin_note")) {
    patch.admin_note = String(formData.get("admin_note")).trim().slice(0, REQUEST_NOTE_MAX) || null;
  }
  const { error } = await supabase.from("chat_requests").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(PAGE);
  redirect(back(formData));
}

async function groupsNow() {
  const { data, error } = await supabase.from("chat_groups").select("id, name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 写进 chat_groups 的那一行，**一列一列点名挑**。parseGroupForm 返回的对象里还带着 `ok`，
 * 原样塞进 insert / update 的话 PostgREST 报「找不到 ok 列」，加群、改群整页 500（#130 起就这样，
 * 假库照单全收所以测试没发现）。
 */
function groupRow(p: { name: string; active: boolean; note: string | null }) {
  return { name: p.name, active: p.active, note: p.note };
}

/** 加一个群。重名（不分大小写、不管空格）拦下：库里有 unique，但那个报错用户看不懂 */
export async function createGroup(formData: FormData) {
  const parsed = parseGroupForm(formData, await groupsNow());
  if (!parsed.ok) redirect(back(formData, `group_error=${parsed.error}`));

  const { error } = await supabase.from("chat_groups").insert(groupRow(parsed));
  if (error) throw new Error(error.message);

  revalidatePath(PAGE);
  redirect(back(formData, "groups=open"));
}

/** 改群名、停抓 / 恢复、改备注。不给删（0030：删了需求就没了来处），不想抓就停 */
export async function updateGroup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(back(formData));
  const parsed = parseGroupForm(formData, await groupsNow(), id);
  if (!parsed.ok) redirect(back(formData, `group_error=${parsed.error}`));

  const { error } = await supabase.from("chat_groups").update(groupRow(parsed)).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(PAGE);
  redirect(back(formData, "groups=open"));
}

/**
 * 删群。挂在它上面的需求**不删**：0031 把外键改成 on delete set null，需求的 group_id 置空，
 * group_name 里还留着抓的时候群叫什么。只是想暂时不抓的话用「在抓」那个勾，删了就从名单里没了。
 */
export async function deleteGroup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(back(formData));
  const { error } = await supabase.from("chat_groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PAGE);
  redirect(back(formData, "groups=open"));
}

/**
 * 批量改状态：勾了一堆，一次设成同一个状态（比如今天不做，全选了标「不跟」，默认视图里就都走了）。
 * 只改 status，备注不动。id 和状态都在服务端重新验一遍：勾选集是浏览器里攒的。
 */
export async function bulkUpdateRequests(formData: FormData) {
  const ids = parseBulkIds(formData.getAll("ids"));
  const status = parseRequestStatus(formData.get("bulk_status"));
  if (!ids.length) redirect(back(formData, "error=none_selected"));
  if (!status) redirect(back(formData, "error=bad"));

  const { error } = await supabase.from("chat_requests").update({ status }).in("id", ids);
  if (error) throw new Error(error.message);

  revalidatePath(PAGE);
  redirect(back(formData, `bulk=${ids.length}`));
}

/** 需求页上的每天单价（估总价用）。空着 = 不设，那个类型的估价就空着 */
export async function saveRequestPrices(formData: FormData) {
  await setRequestPrices({
    beta: parseRequestPrice(formData.get("price_beta")),
    alpha: parseRequestPrice(formData.get("price_alpha")),
  });
  revalidatePath(PAGE);
  redirect(back(formData));
}

