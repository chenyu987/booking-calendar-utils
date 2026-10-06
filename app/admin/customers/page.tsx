import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, PERSON_SPREAD } from "@/lib/people";
import { calcAge } from "@/lib/age";
import { todayIso } from "@/lib/dates";
import { buildFootprints } from "@/lib/footprint";
import { customerName } from "@/lib/referral";
import { parseCustomerEdit } from "@/lib/customerEdit";
import CustomerTable, { type CustomerRow } from "./CustomerTable";
import {
  formStyle,
  inputStyle,
  buttonStyle,
  pageTitleStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

async function createCustomer(formData: FormData) {
  "use server";
  const firstName = (formData.get("first_name") as string)?.trim();
  const phone = (formData.get("phone_number") as string)?.trim();
  const chat = (formData.get("chat") as string)?.trim();
  if (!firstName || !chat) {
    throw new Error("姓名和聊天必填");
  }

  await createPerson("customer", {
    first_name: firstName,
    last_name: (formData.get("last_name") as string)?.trim() || null,
    phone_number: phone || null,
    chat,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
  });
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
  // 编辑的全是人身上的字段（people，0017）—— 这个人要是也是物主，Provider 管理那边跟着变
  const { error } = await supabase.from("people").update(parsed.values).eq("id", id);
  if (error) redirect(`/admin/customers?edit=${id}&error=${encodeURIComponent(error.message)}`);

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
  const [{ data: customers, error }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select(`*, ${PERSON_SPREAD}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("customer_id, demand_days, location, status"),
  ]);

  const footprints = buildFootprints(orders ?? []);
  // 介绍人：关系存在**被介绍人**这一行上（customers.referred_by），
  // 所以这儿不用再查一次，同一批数据里对一下 id 就有了
  const byId = new Map((customers ?? []).map((r) => [r.id, r]));

  const rows: CustomerRow[] = (customers ?? []).map((r) => {
    const fp = footprints.get(r.id);
    return {
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      // 编辑表单的初始值（原样，不拼不算）
      edit: {
        first_name: r.first_name ?? "",
        last_name: r.last_name ?? "",
        phone_number: r.phone_number ?? "",
        chat: r.chat ?? "",
        email: r.email ?? "",
        date_of_birth: r.date_of_birth ?? "",
        status: r.status ?? "active",
        note: r.note ?? "",
      },
      phone: r.phone_number ?? "",
      chat: r.chat ?? "",
      age: calcAge(r.date_of_birth) ?? null,
      status: r.status ?? "",
      referrer: r.referred_by ? customerName(byId.get(r.referred_by)) : "",
      note: r.note ?? "",
      segments: fp?.segments ?? [],
      orderCount: fp?.orderCount ?? 0,
      activeOrderCount: fp?.activeOrderCount ?? 0,
      footprintText: fp?.searchText ?? "",
    };
  });

  return (
    <main>
      <h1 style={pageTitleStyle}>Customer 管理</h1>

      <form action={createCustomer} style={formStyle}>
        <input
          name="first_name"
          placeholder="First name *"
          required
          style={inputStyle}
        />
        <input name="last_name" placeholder="Last name" style={inputStyle} />
        <input
          name="phone_number"
          placeholder="Phone"
          style={inputStyle}
        />
        <input name="chat" placeholder="Chat *" required style={inputStyle} />
        <input
          name="date_of_birth"
          type="date"
          title="生日"
          style={inputStyle}
        />
        <input name="note" placeholder="Note" style={inputStyle} />
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
      />
    </main>
  );
}
