import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { calcAge } from "@/lib/age";
import {
  formStyle,
  inputStyle,
  buttonStyle,
  tableStyle,
  thStyle,
  tdStyle,
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
  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

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

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>姓名</th>
            <th style={thStyle}>电话</th>
            <th style={thStyle}>聊天</th>
            <th style={thStyle}>年龄</th>
            <th style={thStyle}>状态</th>
            <th style={thStyle}>备注</th>
          </tr>
        </thead>
        <tbody>
          {customers?.map((r) => (
            <tr key={r.id}>
              <td style={tdStyle}>
                {r.first_name} {r.last_name}
              </td>
              <td style={tdStyle}>{r.phone_number}</td>
              <td style={tdStyle}>{r.chat}</td>
              <td style={tdStyle}>{calcAge(r.date_of_birth) ?? "-"}</td>
              <td style={tdStyle}>{r.status}</td>
              <td style={tdStyle}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
