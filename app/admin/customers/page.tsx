import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, PERSON_SPREAD } from "@/lib/people";
import { calcAge } from "@/lib/age";
import { displayName } from "@/lib/person";
import { todayIso } from "@/lib/dates";
import { buildFootprints } from "@/lib/footprint";
import { customerName } from "@/lib/referral";
import { parseCustomerEdit } from "@/lib/customerEdit";
import { parseAdminIds } from "@/lib/admins";
import { loadAdmins, loadPersonContacts, saveContacts } from "@/lib/personContacts";
import CustomerTable, { ContactCheckboxes, type CustomerRow } from "./CustomerTable";
import {
  formStyle,
  inputStyle,
  buttonStyle,
  pageTitleStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

async function createCustomer(formData: FormData) {
  "use server";
  // 昵称必填（认人、显示都靠它）；称呼（first_name）是留给以后注册用户自己填的，
  // 后台新增时不填（0020）
  const chatName = (formData.get("chat_name") as string)?.trim();
  const phone = (formData.get("phone_number") as string)?.trim();
  if (!chatName) {
    throw new Error("昵称必填");
  }
  // 「谁的客人」先验再写：认不出来的管理员在建人之前就拦住，不留一个建了一半的人
  const contacts = parseAdminIds(formData.getAll("contact"), await loadAdmins());
  if (!contacts.ok) throw new Error(contacts.reason);

  const id = await createPerson("customer", {
    chat_name: chatName,
    chat_id: (formData.get("chat_id") as string)?.trim() || null,
    phone_number: phone || null,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
  });
  await saveContacts(id, contacts.ids);
  revalidatePath("/admin/customers");
}

// 编辑：列表页的老约定，`?edit=<id>` 进编辑态，存完 redirect 回列表退出。
// 不提供删除 —— 见 lib/customerEdit.ts 开头
async function updateCustomer(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const parsed = parseCustomerEdit((k) => formData.get(k) as string | null, todayIso());
  if ("error" in parsed) {
    // 原因带回页面显示，停在编辑态
    redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(parsed.error)}`);
  }
  // 「谁的客人」也先验完再动库：拦住时一个字都不写
  const contacts = parseAdminIds(formData.getAll("contact"), await loadAdmins());
  if (!contacts.ok) redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(contacts.reason)}`);
  // 编辑的全是人身上的字段（people，0017）—— 这个人要是也是物主，Provider 管理那边跟着变
  const { error } = await supabase.from("people").update(parsed.values).eq("id", id);
  if (error) redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(error.message)}`);
  try {
    await saveContacts(id, contacts.ids);
  } catch (e: any) {
    redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(`「谁的客人」没存上：${e.message}`)}`);
  }

  // 客户名字显示在这些页面上
  for (const p of ["/admin/customers", "/admin/providers", "/admin/overview", "/admin/orders", "/admin/matches", "/admin/referrals", "/admin/payments"]) {
    revalidatePath(p);
  }
  // 带上刚存的是谁：服务端发起的跳转会把页面滚回顶上，表格那边看到 saved 就滚回这一行
  redirect(`/admin/customers?saved=${id}`);
}

export default async function CustomersAdminPage({
  searchParams,
}: {
  searchParams: { edit?: string; error?: string; saved?: string };
}) {
  // 足迹要拉一遍 orders。跟 customers 并行发，页面加载时间取两者里慢的那个，不叠加。
  // 一季 150~250 单，全量拉回来几十 KB，比排期总览拉的还少，不用分页也不用按需加载。
  // 管理员 / 归属两条查询出错会直接抛 —— 当成「都没标」的话，编辑一下就会把原来的全删掉
  const [{ data: customers, error }, { data: orders }, admins, contactsByPerson] = await Promise.all([
    supabase
      .from("customers")
      .select(`*, ${PERSON_SPREAD}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("customer_id, demand_days, location, status"),
    loadAdmins(),
    loadPersonContacts(),
  ]);

  const footprints = buildFootprints(orders ?? []);
  // 介绍人：关系存在**被介绍人**这一行上（customers.referred_by），
  // 所以这儿不用再查一次，同一批数据里对一下 id 就有了
  const byId = new Map((customers ?? []).map((r) => [r.id, r]));

  const rows: CustomerRow[] = (customers ?? []).map((r) => {
    const fp = footprints.get(r.id);
    return {
      id: r.id,
      // 显示名走唯一出处：昵称优先（lib/person.ts）
      name: displayName(r, ""),
      // 编辑表单的初始值（原样，不拼不算）
      edit: {
        chat_name: r.chat_name ?? "",
        chat_id: r.chat_id ?? "",
        first_name: r.first_name ?? "",
        last_name: r.last_name ?? "",
        phone_number: r.phone_number ?? "",
        email: r.email ?? "",
        date_of_birth: r.date_of_birth ?? "",
        status: r.status ?? "active",
        note: r.note ?? "",
      },
      phone: r.phone_number ?? "",
      chatId: r.chat_id ?? "",
      age: calcAge(r.date_of_birth) ?? null,
      status: r.status ?? "",
      referrer: r.referred_by ? customerName(byId.get(r.referred_by)) : "",
      note: r.note ?? "",
      segments: fp?.segments ?? [],
      orderCount: fp?.orderCount ?? 0,
      activeOrderCount: fp?.activeOrderCount ?? 0,
      footprintText: fp?.searchText ?? "",
      contactIds: contactsByPerson.get(r.id) ?? [],
    };
  });

  return (
    <main>
      <h1 style={pageTitleStyle}>Customer 管理</h1>

      <form action={createCustomer} style={formStyle}>
        {/* 昵称排第一：认人、显示都靠它。称呼（First/Last name）留给以后注册用户自己填，这里不放 */}
        <input name="chat_name" placeholder="昵称 *" required style={inputStyle} />
        <input name="chat_id" placeholder="账号" style={inputStyle} />
        <input
          name="phone_number"
          placeholder="Phone"
          style={inputStyle}
        />
        <input
          name="date_of_birth"
          type="date"
          title="生日"
          style={inputStyle}
        />
        <input name="note" placeholder="Note" style={inputStyle} />
        <ContactCheckboxes admins={admins} checked={[]} />
        <button type="submit" style={buttonStyle}>
          新增 Customer
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <CustomerTable
        rows={rows}
        editingId={searchParams.edit ?? null}
        editError={searchParams.error ?? null}
        savedId={searchParams.saved ?? null}
        updateAction={updateCustomer}
        admins={admins}
      />
    </main>
  );
}
