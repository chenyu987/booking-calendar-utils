import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { adminIdFromClaims, safeAdminNext } from "@/lib/adminAuth";
import { adminLogin } from "@/lib/adminLogin";
import BackToHome from "@/components/BackToHome";

export const dynamic = "force-dynamic";

// 管理员登录。跟客户 / 物主共用 Supabase Auth（邮箱 + 密码），但单独一页，因为三件事都不一样：
// - **没有注册**：管理员账号用 `npm run admin:user` 建（scripts/admin-user.mjs），
//   页面上能自己注册的话，谁都能给自己开个后台账号
// - **不认领**：不走 lib/accountClaim.ts，管理员不是 people 里的一个人
// - 登进去之后要确认这个账号**真的是管理员**（app_metadata.admin_id，见 lib/adminAuth.ts），
//   不是的话当场退出 —— 不然一个客户在这儿登了，会带着客户身份被 middleware 一路弹回来
//
// 没有「忘记密码」：要发信，内置发信服务额度极小。管理员忘了密码，
// 重新跑一遍 `npm run admin:user` 设个新的。

async function signIn(formData: FormData) {
  "use server";
  // 逻辑在 lib/adminLogin.ts（要测：不是管理员就当场退出）
  const target = await adminLogin(createSupabaseServerClient().auth, {
    email: (formData.get("email") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
    next: formData.get("next") as string,
  });
  redirect(target);
}

export default async function AdminLoginPage(
  props: {
    searchParams: Promise<{ next?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const next = safeAdminNext(searchParams.next);

  // 已经是登录着的管理员就别停在这儿
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (adminIdFromClaims(data?.claims)) redirect(next);

  const errorText: Record<string, string> = {
    empty: "邮箱和密码都要填",
    badlogin: "邮箱或密码不对",
    notadmin: "这个账号不是管理员",
  };

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <BackToHome />
      <h1 style={{ fontSize: 20 }}>管理员登录</h1>

      {searchParams.error && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.6 }}>
          {errorText[searchParams.error] ?? "出了点问题，再试一次"}
        </p>
      )}

      <form action={signIn} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        <input type="hidden" name="next" value={next} />
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
          autoComplete="current-password"
          placeholder="密码"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          登录
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
