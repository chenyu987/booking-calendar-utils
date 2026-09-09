import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { calcAge } from "@/lib/age";
import { buildFootprints } from "@/lib/footprint";
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
  if (!firstName || !phone) {
    throw new Error("姓名和电话必填");
  }

  const { error } = await supabase.from("customers").insert({
    first_name: firstName,
    last_name: (formData.get("last_name") as string)?.trim() || null,
    phone_number: phone,
    chat: (formData.get("chat") as string)?.trim() || null,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

export default async function CustomersAdminPage() {
  // 足迹要拉一遍 orders。跟 customers 并行发，页面加载时间取两者里慢的那个，不叠加。
  // 一季 150~250 单，全量拉回来几十 KB，比排期总览拉的还少，不用分页也不用按需加载。
  const [{ data: customers, error }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("customer_id, demand_days, location, status"),
  ]);

  const footprints = buildFootprints(orders ?? []);

  const rows: CustomerRow[] = (customers ?? []).map((r) => {
    const fp = footprints.get(r.id);
    return {
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      phone: r.phone_number ?? "",
      chat: r.chat ?? "",
      age: calcAge(r.date_of_birth) ?? null,
      status: r.status ?? "",
      note: r.note ?? "",
      segments: fp?.segments ?? [],
      orderCount: fp?.orderCount ?? 0,
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
          placeholder="Phone *"
          required
          style={inputStyle}
        />
        <input name="chat" placeholder="Chat" style={inputStyle} />
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

      <CustomerTable rows={rows} />
    </main>
  );
}
