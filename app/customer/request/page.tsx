import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/accountClaim";
import LocationInput from "@/components/LocationInput";
import { chatGap } from "@/lib/selfClaim";
import { DATE_INPUT_MAX } from "@/lib/dates";
import { submitRequest } from "./actions";

export const dynamic = "force-dynamic";

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
    .select("chat_name, chat_id")
    .eq("id", customerId)
    .maybeSingle();
  const gap = chatGap(me);

  const errorText: Record<string, string> = {
    party: "至少要有一个人，男女人数不能都填 0",
    dates: "日期不对：结束日期不能早于开始日期",
    save: "没存上，稍后再试一次",
    chat: "先填好昵称和账号再发",
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
      {gap && (
        <div style={noticeStyle}>
          <strong>还没填{gap}，填好才能发需求。</strong>
          配到资源之后我们在聊天上找你；以前找我们租过的，也靠昵称对上你以前的记录。
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
            <input name="start_date" type="date" max={DATE_INPUT_MAX} required style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            结束日期
            <input name="end_date" type="date" max={DATE_INPUT_MAX} required style={inputStyle} />
          </label>
        </div>
        <label style={labelStyle}>
          每人每天预算（美元）
          <input name="budget" type="number" min={0} placeholder="默认 40" style={inputStyle} />
        </label>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
          总价 = 预算 × 天数 × 人数
        </p>

        {/* 聊天不齐时按钮灰掉（服务端 submitRequest 里还会再拦一次） */}
        <button
          type="submit"
          disabled={!!gap}
          style={gap ? { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" } : buttonStyle}
        >
          {gap ? `先填好${gap}才能提交` : "提交需求"}
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
