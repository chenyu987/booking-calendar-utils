import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, PERSON_SPREAD } from "@/lib/people";
import { calcAge } from "@/lib/age";
import { selfName } from "@/lib/person";
import { DATE_INPUT_MAX, todayIso } from "@/lib/dates";
import { buildFootprints } from "@/lib/footprint";
import { customerName } from "@/lib/referral";
import { parseAdminIds } from "@/lib/admins";
import { loadAdmins, loadPersonContacts, saveContacts } from "@/lib/personContacts";
import { saveCustomerEdit } from "./saveCustomer";
import { mergeCustomer } from "./actions";
import { claimSuggestions } from "@/lib/selfClaim";
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

// 编辑：平时是 CustomerTable 在客户端当场切编辑态、后台存（save/route.ts），不走这儿。
// 这个 Server Action 是 JS 没跑起来时的退路：`?edit=<id>` 进编辑态，存完 redirect 回列表。
// 校验和写库只有一份，在 saveCustomer.ts。不提供删除 —— 见 lib/customerEdit.ts 开头
async function updateCustomer(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const result = await saveCustomerEdit(formData);
  // 原因带回页面显示，停在编辑态
  if ("error" in result) redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(result.error)}`);
  // 带上刚存的是谁：服务端发起的跳转会把页面滚回顶上，表格那边看到 saved 就滚回这一行
  redirect(`/admin/customers?saved=${id}`);
}

export default async function CustomersAdminPage(
  props: {
    searchParams: Promise<{ edit?: string; error?: string; saved?: string; merge_error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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

  // 自己登录进来、填的昵称对得上一个老客人的（lib/selfClaim.ts）。只提示，管理员点了才合
  const suggestions = claimSuggestions(customers ?? []);

  const rows: CustomerRow[] = (customers ?? []).map((r) => {
    const fp = footprints.get(r.id);
    return {
      id: r.id,
      // 「昵称」那一列只放昵称；用户自己注册时填的称呼单独带上（lib/person.ts）
      name: r.chat_name ?? "",
      selfName: selfName(r),
      // 编辑表单的初始值（原样，不拼不算）
      edit: {
        chat_name: r.chat_name ?? "",
        chat_id: r.chat_id ?? "",
        phone_number: r.phone_number ?? "",
        email: r.email ?? "",
        date_of_birth: r.date_of_birth ?? "",
        status: r.status ?? "active",
        note: r.note ?? "",
      },
      chatId: r.chat_id ?? "",
      age: calcAge(r.date_of_birth) ?? null,
      status: r.status ?? "",
      referrer: r.referred_by ? customerName(byId.get(r.referred_by)) : "",
      note: r.note ?? "",
      segments: fp?.segments ?? [],
      seasons: fp?.seasons ?? [],
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
          type="date" max={DATE_INPUT_MAX}
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

      {searchParams.merge_error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{searchParams.merge_error}</p>
      )}
      {suggestions.length > 0 && (
        <section style={claimCardStyle}>
          <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>可能是老客人（{suggestions.length}）</h2>
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 8px" }}>
            这些人自己用邮箱登录、新建了账号，填的昵称 / 账号跟一个老客人对上了。确认是同一个人再合并：
            登录账号挂到老客人身上，新账号下的订单一起挪过去，老客人原有的资料不动。
            随便谁都能填别人的昵称，所以不自动合。
          </p>
          {suggestions.map(({ me, old }) => (
            <form
              key={me.id}
              action={mergeCustomer}
              style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13, padding: "4px 0" }}
            >
              <input type="hidden" name="drop" value={me.id} />
              <input type="hidden" name="keep" value={old.id} />
              <span>
                {me.email ?? "（没有邮箱）"} 填的「{me.chat_name || me.chat_id}」
                {footprints.get(me.id)?.orderCount ? `（新账号下 ${footprints.get(me.id)?.orderCount} 单）` : ""}
              </span>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <span>
                老客人 <strong>{old.chat_name || old.chat_id}</strong>
                {old.phone_number ? ` · ${old.phone_number}` : ""}
                {` · ${footprints.get(old.id)?.orderCount ?? 0} 单`}
              </span>
              <button type="submit" style={{ ...buttonStyle, padding: "2px 10px", fontSize: 12 }}>
                是同一个人，合并
              </button>
            </form>
          ))}
        </section>
      )}

      <CustomerTable
        rows={rows}
        editingId={searchParams.edit ?? null}
        editError={searchParams.error ?? null}
        savedId={searchParams.saved ?? null}
        updateAction={updateCustomer}
        today={todayIso()}
        admins={admins}
      />
    </main>
  );
}

const claimCardStyle: React.CSSProperties = {
  border: "1px solid var(--warn)",
  borderRadius: 6,
  padding: "10px 12px",
  margin: "12px 0",
};
