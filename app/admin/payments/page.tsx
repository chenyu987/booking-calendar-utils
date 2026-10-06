import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS, displayName } from "@/lib/person";
import {
  formStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  tableStyle,
  thStyle,
  tdStyle,
  pageTitleStyle,
} from "@/lib/adminStyles";
import { PAY_METHODS } from "@/lib/payMethods";

export const dynamic = "force-dynamic";

async function createPayment(formData: FormData) {
  "use server";
  const { error } = await supabase.from("payments").insert({
    order_id: formData.get("order_id") as string,
    amount: Number(formData.get("amount")),
    method: formData.get("method") as string,
    status: formData.get("status") as string,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/payments");
}

export default async function PaymentsAdminPage() {
  const [{ data: payments, error }, { data: orders }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        `id, amount, method, status, created_at, orders(location, customers(${personSpread(DISPLAY_COLUMNS)}))`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, location")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <main>
      <h1 style={pageTitleStyle}>Payment 记账</h1>

      <form action={createPayment} style={formStyle}>
        <select name="order_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Order
          </option>
          {orders?.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.location} · {o.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          step="0.01"
          placeholder="金额"
          required
          style={inputStyle}
        />
        <select name="method" style={selectStyle} defaultValue={PAY_METHODS[0]}>
          {PAY_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select name="status" style={selectStyle} defaultValue="pending">
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="refunded">refunded</option>
        </select>
        <button type="submit" style={buttonStyle}>
          登记付款
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Order</th>
            <th style={thStyle}>金额</th>
            <th style={thStyle}>方式</th>
            <th style={thStyle}>状态</th>
          </tr>
        </thead>
        <tbody>
          {payments?.map((p: any) => (
            <tr key={p.id}>
              <td style={tdStyle}>
                {p.orders?.location} / {displayName(p.orders?.customers, "")}
              </td>
              <td style={tdStyle}>{p.amount}</td>
              <td style={tdStyle}>{p.method}</td>
              <td style={tdStyle}>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
