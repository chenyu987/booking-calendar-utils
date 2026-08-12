import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

async function submitListing(formData: FormData) {
  "use server";
  const phone = (formData.get("phone_number") as string)?.trim();
  if (!phone) throw new Error("手机号必填");

  const { data: existing } = await supabase
    .from("providers")
    .select("id")
    .eq("phone_number", phone)
    .maybeSingle();

  let providerId = existing?.id as string | undefined;

  if (!providerId) {
    const { data: newProvider, error: providerError } = await supabase
      .from("providers")
      .insert({
        first_name: formData.get("first_name") as string,
        phone_number: phone,
        chat: formData.get("chat") as string,
        status: "active",
      })
      .select("id")
      .single();
    if (providerError) throw new Error(providerError.message);
    providerId = newProvider.id;
  }

  const { error: resourceError } = await supabase.from("resources").insert({
    provider_id: providerId,
    item_type: formData.get("item_type") as string,
    holder_name: formData.get("holder_name") as string,
    holder_gender: formData.get("holder_gender") as string,
    holder_date_of_birth: (formData.get("holder_date_of_birth") as string) || null,
    date_range_start: formData.get("start_date") as string,
    date_range_end: formData.get("end_date") as string,
    status: "active",
  });
  if (resourceError) throw new Error(resourceError.message);

  revalidatePath("/admin/overview");
  revalidatePath("/admin/resources");
  redirect("/provider/listing?submitted=1");
}

export default function ProviderListingPage({
  searchParams,
}: {
  searchParams: { submitted?: string };
}) {
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>挂出可租资源</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        填一下你手上的额度信息，有人要租的话管理员会联系你。
      </p>

      {searchParams.submitted && <p style={{ color: "green" }}>提交成功。</p>}

      <form
        action={submitListing}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}
      >
        <input name="first_name" placeholder="称呼" required style={inputStyle} />
        <input
          name="phone_number"
          placeholder="手机号（用于找回记录）"
          required
          style={inputStyle}
        />
        <input name="chat" placeholder="账号" style={inputStyle} />
        <select name="item_type" required style={inputStyle} defaultValue="beta">
          <option value="beta">Beta</option>
          <option value="alpha">Alpha</option>
        </select>

        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 6,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>持有人信息</div>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
            物品是登记了使用人的，客户得跟持有人性别年龄对得上才能核验时。
            如果你手上有好几个人的资源，一个资源挂一次。
          </p>
          <input
            name="holder_name"
            placeholder="资源上的名字，比如 David Chang"
            required
            style={inputStyle}
          />
          <select
            name="holder_gender"
            required
            style={inputStyle}
            defaultValue=""
          >
            <option value="" disabled>
              持有人性别
            </option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
          <label style={labelStyle}>
            持有人生日
            <input
              name="holder_date_of_birth"
              type="date"
              required
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          可用开始日期
          <input name="start_date" type="date" required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          可用结束日期
          <input name="end_date" type="date" required style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          提交
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
