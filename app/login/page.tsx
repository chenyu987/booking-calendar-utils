import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { claimFor, homeFor, parseRole, type Role } from "@/lib/accountClaim";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

// 邮箱 + 密码登录。**一封邮件都不发** —— 前提是 Supabase 控制台里
// Authentication → Providers → Email 的「Confirm email」关掉，否则注册那一下
// 还是会发确认信，又撞上内置发信服务的限流。
//
// 为什么不是验证码：内置 SMTP 额度极小（每小时个位数），每测几次就发不出去。
// 验证码那套代码没删（/auth/callback 还在），等接了自己的 SMTP 想换回来
// 是个配置问题，不是重写。
//
// 为什么不自己存密码：Supabase Auth 已经管了哈希、会话、cookie 这些，
// 自己造一张用户表存密码是纯粹的自找麻烦，而且以后开 RLS 要用 auth.uid()。
//
// 注意：**忘记密码需要发信**，所以在接自己的 SMTP 之前，用户忘了密码只能
// 你在 Supabase 后台手动改。这是这一步的已知代价。
function loginPath(role: Role, extra = "") {
  const params = [role === "provider" ? "as=provider" : "", extra].filter(Boolean).join("&");
  return `/login${params ? `?${params}` : ""}`;
}

async function signIn(formData: FormData) {
  "use server";
  const role = parseRole(formData.get("as") as string);
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  if (!email || !password) redirect(loginPath(role, "error=empty"));

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error("[login] signInWithPassword 失败", error?.code, error?.message);
    redirect(loginPath(role, "error=badlogin"));
  }

  try {
    await claimFor(role, data.user.id, data.user.email ?? null);
  } catch {
    // 认领失败不该把人挡在门外：session 已经建好了，落地页那边会再兜一次底
  }
  redirect(homeFor(role));
}

async function signUp(formData: FormData) {
  "use server";
  const role = parseRole(formData.get("as") as string);
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm") as string) ?? "";
  const back = (err: string) => loginPath(role, `mode=signup&error=${err}`);

  if (!email || !password) redirect(back("empty"));
  // 没有邮件找回密码这条路（要发信），打错了只能找管理员重置，所以让他打两遍
  if (password !== confirm) redirect(back("mismatch"));
  if (password.length < 8) redirect(back("weak"));

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error("[login] signUp 失败", error.code, error.message);
    if (error.code === "user_already_exists") redirect(back("exists"));
    redirect(back("save"));
  }
  // Confirm email 没关的话，signUp 不会直接给 session —— 这时候得提示去收信，
  // 否则用户会卡在「注册成功了但没登进去」而不知道为什么
  if (!data.session) redirect(loginPath(role, "error=needconfirm"));

  try {
    await claimFor(role, data.user!.id, data.user!.email ?? null);
  } catch {
    // 同上，兜底交给落地页
  }
  redirect(homeFor(role));
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { as?: string; mode?: string; error?: string };
}) {
  const role: Role = parseRole(searchParams.as);
  const isProvider = role === "provider";
  const isSignup = searchParams.mode === "signup";

  // 已经登录了就别停在登录页
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(homeFor(role));

  const errorText: Record<string, string> = {
    empty: "邮箱和密码都要填",
    badlogin: "邮箱或密码不对。第一次来的话点下面「还没有账号」去注册",
    mismatch: "两次输入的密码不一样",
    weak: "密码至少 8 位",
    exists: "这个邮箱已经注册过了，直接登录就行",
    needconfirm:
      "注册成功了，但这个项目还开着邮箱确认 —— 去收一下确认邮件，或者让管理员把 Confirm email 关掉",
    save: "注册没成功，稍后再试",
  };

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>
        {isProvider ? "物主" : "客户"}
        {isSignup ? "注册" : "登录"}
      </h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        {isSignup
          ? "填邮箱、设一个密码就行，不用收验证码。"
          : "用邮箱和密码登录。"}
      </p>

      {searchParams.error && (
        <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0", lineHeight: 1.6 }}>
          {errorText[searchParams.error] ?? "出了点问题，再试一次"}
        </p>
      )}

      <form
        action={isSignup ? signUp : signIn}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}
      >
        <input type="hidden" name="as" value={role} />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="邮箱"
          style={inputStyle}
        />
        <input
          name="password"
          type="password"
          required
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "设一个密码（至少 8 位）" : "密码"}
          style={inputStyle}
        />
        {isSignup && (
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="再打一遍密码"
            style={inputStyle}
          />
        )}
        <button type="submit" style={buttonStyle}>
          {isSignup ? "注册并登录" : "登录"}
        </button>
      </form>

      <p style={{ fontSize: 13, marginTop: 14 }}>
        {isSignup ? (
          <Link href={loginPath(role)} style={linkStyle}>
            已经有账号了？去登录 →
          </Link>
        ) : (
          <Link href={loginPath(role, "mode=signup")} style={linkStyle}>
            还没有账号？注册一个 →
          </Link>
        )}
      </p>

      {!isSignup && (
        <p style={{ fontSize: 12, color: "#999", marginTop: 10, lineHeight: 1.7 }}>
          忘了密码暂时得找管理员重置 —— 邮件找回要等接上发信服务。
        </p>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
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
const linkStyle: React.CSSProperties = { color: "#1c4e78" };
