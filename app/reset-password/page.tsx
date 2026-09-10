import { redirect } from "next/navigation";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabaseServer";
import { homeFor, parseRole, type Role } from "@/lib/accountClaim";

export const dynamic = "force-dynamic";

// 设新密码。点重置邮件里的链接 → /auth/callback 换到 session → 落到这里。
// 所以这一页本身不校验什么 token：能进来就说明已经有合法 session 了。
async function updatePassword(formData: FormData) {
  "use server";
  const role = parseRole(formData.get("as") as string);
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm") as string) ?? "";
  const back = (err: string) =>
    `/reset-password?error=${err}${role === "provider" ? "&as=provider" : ""}`;

  if (password !== confirm) redirect(back("mismatch"));
  if (password.length < 8) redirect(back("weak"));

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[reset-password] updateUser 失败", error.code, error.message);
    redirect(back("save"));
  }
  redirect(`${homeFor(role)}?pwchanged=1`);
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { as?: string; error?: string };
}) {
  const role: Role = parseRole(searchParams.as);

  // 没 session 说明链接过期了、或者有人直接手输了这个地址
  const user = await getSessionUser();
  if (!user) redirect(`/login?error=resetexpired${role === "provider" ? "&as=provider" : ""}`);

  const errorText: Record<string, string> = {
    mismatch: "两次输入的密码不一样",
    weak: "密码至少 8 位",
    save: "没改成功，再试一次",
  };

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>设一个新密码</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{user.email}</p>

      {searchParams.error && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>
          {errorText[searchParams.error] ?? "出了点问题，再试一次"}
        </p>
      )}

      <form
        action={updatePassword}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}
      >
        <input type="hidden" name="as" value={role} />
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="新密码（至少 8 位）"
          style={inputStyle}
        />
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="再打一遍"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          保存新密码
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
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
