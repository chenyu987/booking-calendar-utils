import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/customerClaim";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

// 两步登录，都停在这一个页面上：填邮箱 → 收 6 位验证码 → 填码进去。
//
// 为什么是验证码不是点链接：链接会在系统默认浏览器里打开，很可能不是用户
// 正在用的那个；而且邮件客户端的预取会把一次性链接先点掉，用户真去点的时候
// 已经 otp_expired 了（dev 日志里真实遇到过）。验证码全程不离开当前标签页。
//
// 邮件里的链接仍然有效（/auth/callback 还在），两条路都能走。
async function sendCode(formData: FormData) {
  "use server";
  const email = ((formData.get("email") as string) ?? "").trim();
  if (!email) redirect("/customer/login?error=empty");

  const host = headers().get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback` },
  });
  if (error) {
    // 真实报错打到服务端日志：页面上只能给一句人话，出问题时靠这行定位
    console.error("[customer-login] signInWithOtp 失败", error.code, error.message);
    // 限流是最常见的一种，单独给一句准确的 —— 说成「检查邮箱地址对不对」
    // 会把人往完全错误的方向带（地址是对的，就是发太频了）
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      redirect(`/customer/login?error=ratelimit&sentto=${encodeURIComponent(email)}`);
    }
    redirect("/customer/login?error=send");
  }
  redirect(`/customer/login?sent=${encodeURIComponent(email)}`);
}

async function verifyCode(formData: FormData) {
  "use server";
  const email = ((formData.get("email") as string) ?? "").trim();
  // 用户从邮件里复制，常带空格；6 位数字之外的字符一律去掉
  const token = ((formData.get("token") as string) ?? "").replace(/\D/g, "");
  const back = `/customer/login?sent=${encodeURIComponent(email)}`;
  if (!email) redirect("/customer/login?error=empty");
  if (token.length !== 6) redirect(`${back}&error=badcode`);

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error || !data.user) redirect(`${back}&error=wrongcode`);

  try {
    await claimCustomer(data.user.id, data.user.email ?? null);
  } catch {
    // 认领失败不该把人挡在门外：session 已经建好了，/customer 那边会再兜一次底
  }
  redirect("/customer");
}

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; sentto?: string };
}) {
  // 已经登录了就别停在登录页
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/customer");

  const errorText: Record<string, string> = {
    empty: "邮箱不能为空",
    send: "邮件没发出去，检查一下邮箱地址对不对，或者稍后再试",
    ratelimit: "发得太频繁了，被邮件服务限流了 —— 等几分钟再试。刚才那封如果收到了，直接用里面的码就行。",
    badcode: "验证码是 6 位数字",
    wrongcode: "验证码不对或者已经过期了，可以重新发一封",
    expired: "这条登录链接已经用过或者过期了，重新发一封",
    nocode: "链接不完整，重新发一封",
  };
  const errorLine = searchParams.error ? (
    <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>
      {errorText[searchParams.error] ?? "出了点问题，再试一次"}
    </p>
  ) : null;

  if (searchParams.sent) {
    return (
      <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
        <BackToHome />
        <h1 style={{ fontSize: 20 }}>输入验证码</h1>
        <p style={{ color: "#666", fontSize: 13, lineHeight: 1.7 }}>
          验证码已经发到 <strong>{searchParams.sent}</strong>，6 位数字，
          10 分钟内有效。没看到的话翻一下垃圾邮件。
        </p>
        {errorLine}

        <form
          action={verifyCode}
          style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}
        >
          <input type="hidden" name="email" value={searchParams.sent} />
          <input
            name="token"
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 位验证码"
            maxLength={6}
            style={codeInputStyle}
          />
          <button type="submit" style={buttonStyle}>
            登录
          </button>
        </form>

        <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
          <form action={sendCode}>
            <input type="hidden" name="email" value={searchParams.sent} />
            <button type="submit" style={linkButton}>
              没收到？重新发一封
            </button>
          </form>
          <Link href="/customer/login" style={{ fontSize: 13, color: "#1c4e78" }}>
            换个邮箱
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>客户登录</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        填邮箱，我们发一个 6 位验证码给你 —— 不用设密码。
      </p>
      {errorLine}
      {searchParams.sentto && (
        <p style={{ fontSize: 13, margin: "8px 0 0" }}>
          <Link
            href={`/customer/login?sent=${encodeURIComponent(searchParams.sentto)}`}
            style={{ color: "#1c4e78" }}
          >
            已经收到过码了？直接去输 →
          </Link>
        </p>
      )}
      <form
        action={sendCode}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}
      >
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="你的邮箱"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          发送验证码
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const codeInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontSize: 22,
  letterSpacing: 6,
  textAlign: "center",
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
const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#1c4e78",
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "underline",
};
