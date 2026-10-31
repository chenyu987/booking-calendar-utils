import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { DATE_INPUT_MAX } from "@/lib/dates";
import { submitListing } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProviderListingPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);

  const { data: me } = await supabase
    .from("people")
    .select("first_name, phone_number, chat_name, chat_id, date_of_birth")
    .eq("id", providerId)
    .maybeSingle();

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <Link href="/provider" style={{ fontSize: 13, color: "var(--link)" }}>
        ← 我的资源
      </Link>
      <h1 style={{ fontSize: 20 }}>挂出可租资源</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        填一下你手上的额度信息，有人要租的话管理员会联系你。
      </p>
      {searchParams.error === "chat" && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>
          昵称和账号都得填 —— 我们是通过聊天联系你的，以前在我们这儿挂过资源的也靠昵称对上原来的记录。
        </p>
      )}

      <form
        action={submitListing}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}
      >
        <select name="item_type" required style={inputStyle} defaultValue="alpha">
          <option value="beta">Beta</option>
          <option value="alpha">Alpha</option>
        </select>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>持有人信息</div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
            物品是登记了使用人的，客户得跟持有人性别年龄对得上才能核验时。
            如果你手上有好几个人的资源，一个资源挂一次。
          </p>
          <input
            name="holder_name"
            placeholder="资源上的名字，比如 David Chang"
            // 不预填：持有人姓名得跟资源上、照片上的真名对得上（物品登记了使用人）。
            // 原来拿物主的称呼预填，可称呼不一定是真名，也不一定是这个资源的持有人 ——
            // 预填了多半就被原样提交上去
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
              type="date" max={DATE_INPUT_MAX}
              defaultValue={me?.date_of_birth ?? ""}
              required
              style={inputStyle}
            />
          </label>
        </div>

        <label style={labelStyle}>
          可用开始日期
          <input name="start_date" type="date" max={DATE_INPUT_MAX} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          可用结束日期
          <input name="end_date" type="date" max={DATE_INPUT_MAX} style={inputStyle} />
        </label>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
          有效期选填，不填就是这一头不设限 —— 整季通用的资源两个都空着就行。
          拿不准别瞎填：填错了会让本来配得上的单子被拦掉。
        </p>
        <fieldset style={fieldsetStyle}>
          <legend style={{ fontSize: 12, color: "var(--text-muted)", padding: "0 4px" }}>
            怎么联系你（有人要租的时候用）
          </legend>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              name="first_name"
              placeholder="称呼"
              defaultValue={me?.first_name ?? ""}
              style={inputStyle}
            />
            <input
              name="chat_name"
              placeholder="昵称 *（聊天里显示的名字）"
              required
              defaultValue={me?.chat_name ?? ""}
              style={inputStyle}
            />
            <input
              name="chat_id"
              placeholder="账号 *（聊天 → 我，名字下面那串）"
              required
              defaultValue={me?.chat_id ?? ""}
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: "var(--warn)", margin: 0, lineHeight: 1.6 }}>
              重要：昵称和账号都必填 —— 有人要租你的资源，我们是通过聊天联系你的；
              以前在我们这儿挂过资源的，也靠昵称对上原来的记录。
            </p>
            <input
              name="phone_number"
              placeholder="手机号"
              defaultValue={me?.phone_number ?? ""}
              style={inputStyle}
            />
          </div>
        </fieldset>

        <button type="submit" style={buttonStyle}>
          提交
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
const fieldsetStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 10,
  margin: 0,
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
