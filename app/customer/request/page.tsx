import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/accountClaim";
import { dateRangeToArray } from "@/lib/dates";
import LocationInput from "@/components/LocationInput";

export const dynamic = "force-dynamic";

// 发租借需求。联系方式不在这儿填 —— 那是 /customer 上「个人资料」的事，
// 同一份信息两个地方能改，早晚对不上。
//
// 身份来自登录，**不再来自手机号** —— 以前这个页面是「输谁的手机号就是谁」，
// 有了 magic link 登录之后那套必须废掉，否则同一个人会在库里裂成两行：
// 一行挂在他的账号上（/customer 看到的），一行挂在他填的手机号上（这个表单造的）。
async function submitRequest(formData: FormData) {
  "use server";

  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = await claimCustomer(user.id, user.email ?? null);

  const maleCount = Number(formData.get("male_count") ?? 0);
  const femaleCount = Number(formData.get("female_count") ?? 0);
  if (maleCount + femaleCount < 1) {
    redirect("/customer/request?error=party");
  }

  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  if (!startDate || !endDate || endDate < startDate) {
    redirect("/customer/request?error=dates");
  }
  const demandDays = dateRangeToArray(startDate, endDate);

  // amount 存总价：单价 × 天数 × 人数，跟 admin 那边算法一致
  const pricePerDay = formData.get("budget") ? Number(formData.get("budget")) : 40;
  const amount = pricePerDay * demandDays.length * (maleCount + femaleCount);

  const { error: orderError } = await supabase.from("orders").insert({
    customer_id: customerId,
    location: ((formData.get("location") as string) ?? "").trim() || null,
    male_count: maleCount,
    female_count: femaleCount,
    amount,
    demand_days: demandDays,
    status: "created",
  });
  if (orderError) redirect("/customer/request?error=save");

  revalidatePath("/customer");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  redirect("/customer?created=1");
}

export default async function CustomerRequestPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = await claimCustomer(user.id, user.email ?? null);

  // 只读地看一眼联系方式填没填 —— 改还是只能在个人资料里改，
  // 这里不放输入框，免得同一份信息两个地方能改
  const { data: me } = await supabase
    .from("people")
    .select("phone_number, chat_id")
    .eq("id", customerId)
    .maybeSingle();
  const noContact = !me?.phone_number && !me?.chat_id;

  const errorText: Record<string, string> = {
    party: "至少要有一个人，男女人数不能都填 0",
    dates: "日期不对：结束日期不能早于开始日期",
    save: "没存上，稍后再试一次",
  };

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <Link href="/customer" style={{ fontSize: 13, color: "var(--link)" }}>
        ← 我的订单
      </Link>
      <h1 style={{ fontSize: 20 }}>发一个租借需求</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        填完提交，管理员会帮你匹配物主，匹配好了会联系你。
      </p>

      {searchParams.error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>
          {errorText[searchParams.error] ?? "出了点问题，再试一次"}
        </p>
      )}

      {/* 提醒放在建单这一刻，而不是只在个人资料页上摆着 —— 用户想不起来
          去个人资料，但一定会走这个表单。带 next 回来，填完不用重新找路 */}
      {noContact && (
        <div style={noticeStyle}>
          <strong>还没留联系方式。</strong>
          配到资源之后我们要通知你，光有邮箱容易漏 —— 留个聊天或者手机号吧。
          <div style={{ marginTop: 6 }}>
            <Link
              href="/customer?edit=profile&next=request"
              style={{ color: "var(--warn)", fontWeight: 500 }}
            >
              去填（填完自动回到这里）→
            </Link>
          </div>
        </div>
      )}

      <form
        action={submitRequest}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}
      >
        <label style={labelStyle}>
          想去哪个地点
          <LocationInput
            name="location"
            placeholder="比如 locaj（打字会有提示）"
            required
            style={inputStyle}
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            男生几人
            <input name="male_count" type="number" min={0} defaultValue={0} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            女生几人
            <input name="female_count" type="number" min={0} defaultValue={0} style={inputStyle} />
          </label>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
          物品是登记了使用人的，核验时要跟持有人对得上，所以男女要分开填 —— 一个人一个资源。
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            开始日期
            <input name="start_date" type="date" required style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            结束日期
            <input name="end_date" type="date" required style={inputStyle} />
          </label>
        </div>
        <label style={labelStyle}>
          每人每天预算（美元）
          <input name="budget" type="number" min={0} placeholder="默认 40" style={inputStyle} />
        </label>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
          总价 = 预算 × 天数 × 人数
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
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--text-muted)",
};
const noticeStyle: React.CSSProperties = {
  background: "var(--notice-bg)",
  border: "1px solid var(--notice-border)",
  color: "var(--warn)",
  borderRadius: 4,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.6,
  marginTop: 12,
};
const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
