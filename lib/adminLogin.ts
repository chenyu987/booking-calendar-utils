import { adminIdFromClaims, safeAdminNext } from "./adminAuth";

// 管理员登录那一下（app/login/admin/page.tsx 的 Server Action）的逻辑，抽出来是为了能测：
// 页面里的 Server Action 测试调不到，而这里有一条要盯住的规则 ——
// **登进来的不是管理员就当场退出**，不然客户账号在这儿登了，session 就留在浏览器里了。

type AuthLike = {
  signInWithPassword(c: { email: string; password: string }): Promise<{
    data: { user: { app_metadata?: unknown } | null };
    error: { code?: string; message?: string } | null;
  }>;
  signOut(): Promise<unknown>;
};

function loginPath(extra: Record<string, string>) {
  const qs = new URLSearchParams(extra).toString();
  return `/login/admin${qs ? `?${qs}` : ""}`;
}

/** 登录，返回该跳去哪（成功 = next；失败 = 带着错误码回登录页） */
export async function adminLogin(
  auth: AuthLike,
  form: { email: string; password: string; next: string | null | undefined }
): Promise<string> {
  const next = safeAdminNext(form.next);
  const email = form.email.trim();
  if (!email || !form.password) return loginPath({ error: "empty", next });

  const { data, error } = await auth.signInWithPassword({ email, password: form.password });
  if (error || !data.user) {
    console.error("[admin login] signInWithPassword 失败", error?.code, error?.message);
    return loginPath({ error: "badlogin", next });
  }
  if (!adminIdFromClaims(data.user)) {
    await auth.signOut();
    return loginPath({ error: "notadmin", next });
  }
  return next;
}
