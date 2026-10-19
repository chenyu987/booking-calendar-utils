import { describe, it, expect, vi } from "vitest";
import { adminLogin } from "@/lib/adminLogin";

// 管理员登录页那一下（lib/adminLogin.ts）。不连 Supabase，auth 是假的。

const ADMIN = "11111111-1111-4111-8111-111111111111";

function fakeAuth(user: { app_metadata?: unknown } | null, error: { code?: string } | null = null) {
  return {
    signInWithPassword: vi.fn(async () => ({ data: { user }, error })),
    signOut: vi.fn(async () => ({})),
  };
}

const form = (over: Partial<{ email: string; password: string; next: string | null }> = {}) => ({
  email: "a@example.com",
  password: "pw123456",
  next: "/admin/customers",
  ...over,
});

describe("管理员登录", () => {
  it("管理员：登进去，回到原来要去的页面", async () => {
    const auth = fakeAuth({ app_metadata: { admin_id: ADMIN } });
    expect(await adminLogin(auth, form())).toBe("/admin/customers");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("**不是管理员（客户 / 物主账号）：当场退出**，回登录页说「不是管理员」", async () => {
    const auth = fakeAuth({ app_metadata: { provider: "email" } });
    const target = await adminLogin(auth, form());
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(target).toContain("/login/admin?");
    expect(target).toContain("error=notadmin");
  });

  it("密码错：回登录页，不退出（本来就没登进去）", async () => {
    const auth = fakeAuth(null, { code: "invalid_credentials" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await adminLogin(auth, form())).toContain("error=badlogin");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("空着：不去问 Supabase", async () => {
    const auth = fakeAuth(null);
    expect(await adminLogin(auth, form({ password: "" }))).toContain("error=empty");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("**next 指向别的网站：不跟过去**，回排期总览", async () => {
    const auth = fakeAuth({ app_metadata: { admin_id: ADMIN } });
    expect(await adminLogin(auth, form({ next: "https://evil.example/admin" }))).toBe("/admin/overview");
    expect(await adminLogin(auth, form({ next: "//evil.example" }))).toBe("/admin/overview");
  });
});
