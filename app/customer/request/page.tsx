import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { dateRangeToArray } from "@/lib/dates";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

async function submitRequest(formData: FormData) {
  "use server";

  const phone = (formData.get("phone_number") as string)?.trim();
  if (!phone) throw new Error("手机号必填，用来找回你的订单");

  // 还没做正式登录认证，先用手机号简化识别：有就复用，没有就新建
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("phone_number", phone)
    .maybeSingle();

  let customerId = existing?.id as string | undefined;
  if (!customerId) {
    const { data: newCustomer, error: customerError } = await supabase
      .from("customers")
      .insert({
        first_name: formData.get("first_name") as string,
        phone_number: phone,
        chat: formData.get("chat") as string,
        status: "active",
      })
      .select("id")
      .single();
    if (customerError) throw new Error(customerError.message);
    customerId = newCustomer.id;
  }

  const maleCount = Number(formData.get("male_count") ?? 0);
  const femaleCount = Number(formData.get("female_count") ?? 0);
  if (maleCount + femaleCount < 1) {
    throw new Error("至少要有一个人，男/女人数不能都填 0");
  }

  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const demandDays = dateRangeToArray(startDate, endDate);

  // Amount 存总价：单价 × 天数 × 人数，跟现在 Sheet 里 45*3*4=540 的算法一致
  const pricePerDay = formData.get("budget") ? Number(formData.get("budget")) : 40;
  const amount = pricePerDay * demandDays.length * (maleCount + femaleCount);

  const { error: orderError } = await supabase.from("orders").insert({
    customer_id: customerId,
    location: formData.get("location") as string,
    male_count: maleCount,
    female_count: femaleCount,
    amount,
    demand_days: demandDays,
    status: "created",
  });
  if (orderError) throw new Error(orderError.message);

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/");
  redirect("/customer/request?submitted=1");
}

export default function CustomerRequestPage({
  searchParams,
}: {
  searchParams: { submitted?: string };
}) {
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>我要租借</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        填一下你的需求，管理员会人工帮你匹配 Provider，匹配到了会通过手机/聊天联系你。
      </p>

      {searchParams.submitted && (
        <p style={{ color: "green" }}>提交成功，等通知就行。</p>
      )}

      <form
        action={submitRequest}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}
      >
        <input name="first_name" placeholder="称呼" required style={inputStyle} />
        <input
          name="phone_number"
          placeholder="手机号（用于找回订单）"
          required
          style={inputStyle}
        />
        <input name="chat" placeholder="账号" style={inputStyle} />
        <input
          name="location"
          placeholder="想去的地点，比如 Whistler"
          required
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            男生几人
            <input
              name="male_count"
              type="number"
              min={0}
              defaultValue={0}
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            女生几人
            <input
              name="female_count"
              type="number"
              min={0}
              defaultValue={0}
              style={inputStyle}
            />
          </label>
        </div>
        <label style={labelStyle}>
          开始日期
          <input name="start_date" type="date" required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          结束日期
          <input name="end_date" type="date" required style={inputStyle} />
        </label>
        <input
          name="budget"
          placeholder="每人每天预算（美元，默认 40）"
          type="number"
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
          总价 = 每人每天预算 × 天数 × 人数
        </p>
        <button type="submit" style={buttonStyle}>
          提交需求
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#444",
};
const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
