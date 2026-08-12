import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatParty } from "@/lib/party";
import { formatHolder } from "@/lib/age";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

async function proposeMatch(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;
  const resourceId = formData.get("resource_id") as string;
  const providerPhone = formData.get("provider_phone") as string;

  // Provider 从 resource 带出来，不重复存
  const { error } = await supabase.from("matches").insert({
    order_id: orderId,
    resource_id: resourceId,
    status: "proposed",
  });
  if (error) throw new Error(error.message);

  redirect(`/provider/matches?phone=${encodeURIComponent(providerPhone)}&proposed=1`);
}

export default async function ProviderMatchesPage({
  searchParams,
}: {
  searchParams: { phone?: string; proposed?: string };
}) {
  const phone = searchParams.phone;

  let provider: any = null;
  let myResources: any[] = [];
  let openOrders: any[] = [];

  if (phone) {
    const { data: providerData } = await supabase
      .from("providers")
      .select("*")
      .eq("phone_number", phone)
      .maybeSingle();
    provider = providerData;

    if (provider) {
      const { data: resources } = await supabase
        .from("resources")
        .select("*")
        .eq("provider_id", provider.id)
        .eq("status", "active");
      myResources = resources ?? [];

      const { data: orders } = await supabase
        .from("orders")
        .select(
          "id, location, amount, demand_days, status, male_count, female_count, customers(first_name)"
        )
        .eq("status", "created")
        .order("created_at", { ascending: false });
      openOrders = orders ?? [];
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>Provider 匹配台</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        输入你注册时的手机号，看看有哪些需求可以匹配你手上的资源。
      </p>

      <form method="GET" style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          name="phone"
          defaultValue={phone}
          placeholder="你的手机号"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          查看
        </button>
      </form>

      {phone && !provider && (
        <p style={{ color: "crimson" }}>
          没找到这个手机号对应的 Provider，先去 Provider 挂牌页面注册。
        </p>
      )}

      {provider && myResources.length === 0 && (
        <p style={{ color: "#666" }}>你名下没有在出租的资源，先去挂一个。</p>
      )}

      {searchParams.proposed && (
        <p style={{ color: "green" }}>已提交匹配意向，等 Admin 审核。</p>
      )}

      {provider && myResources.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>地点</th>
              <th style={thStyle}>人数</th>
              <th style={thStyle}>天数</th>
              <th style={thStyle}>总价</th>
              <th style={thStyle}>用哪个 Resource</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map((o: any) => (
              <tr key={o.id}>
                <td style={tdStyle}>{o.customers?.first_name ?? "-"}</td>
                <td style={tdStyle}>{o.location}</td>
                <td style={tdStyle}>{formatParty(o.male_count, o.female_count)}</td>
                <td style={tdStyle}>{o.demand_days?.length ?? 0} 天</td>
                <td style={tdStyle}>{o.amount ?? "-"}</td>
                <td style={tdStyle}>
                  <form action={proposeMatch} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="order_id" value={o.id} />
                    <input type="hidden" name="provider_phone" value={phone} />
                    <select name="resource_id" style={inputStyle}>
                      {myResources.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.holder_name ?? "?"}（
                          {formatHolder(s.holder_gender, s.holder_date_of_birth)}
                          ）· {s.date_range_start}~{s.date_range_end}
                        </option>
                      ))}
                    </select>
                    <button type="submit" style={buttonStyle}>
                      我可以匹配
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 6,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 16,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 8,
  borderBottom: "1px solid #ddd",
  fontSize: 13,
  color: "#666",
};
const tdStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #eee",
  fontSize: 14,
};
