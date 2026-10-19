import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// middleware.ts 的集成测试：/admin 那道门。
//
// 浏览器测试跑的是 E2E 假登录（E2E_FAKE_LOGIN，构建时定死），**真登录那条路它整个跳过**——
// 所以这道门改坏了（没登录也放行、伪造请求头冒充管理员），浏览器测试照样绿。这里补上。
// 不连 Supabase：把 @supabase/ssr 换掉，getClaims 返回什么由每条测试定。

let claims: Record<string, unknown> | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

const { middleware } = await import("@/middleware");

const LUCAS = "11111111-1111-4111-8111-111111111111";
const MUSHII = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_UID = "33333333-3333-4333-8333-333333333333";
const ADMIN_UID = "44444444-4444-4444-8444-444444444444";

/** 线上的样子：Cloud Run 前面那层给 https，Host 是域名，Next 自己的 req.url 是 localhost */
function req(path: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    host: "beta.example.com",
    "x-forwarded-proto": "https",
    ...init.headers,
  };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://localhost:8080${path}`, { method: init.method ?? "GET", headers });
}

/** NextResponse.next({ request: { headers } }) 往下传的请求头，Next 编码成 x-middleware-request-* */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

const asAdmin = (adminId = LUCAS) => {
  claims = { sub: ADMIN_UID, app_metadata: { admin_id: adminId } };
};
const asCustomer = () => {
  claims = { sub: CUSTOMER_UID, app_metadata: { provider: "email" } };
};

beforeEach(() => {
  claims = null;
});

describe("没登录", () => {
  it("开 /admin 页面 → 跳管理员登录页，**跳到用户访问的那个域名**（不是 Next 自己的 localhost）", async () => {
    const res = await middleware(req("/admin/overview?season=25-26-na"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://beta.example.com");
    expect(loc.pathname).toBe("/login/admin");
    expect(loc.searchParams.get("next")).toBe("/admin/overview?season=25-26-na");
  });

  it("直接 POST 到 /admin 底下的接口 → 401，**不执行**", async () => {
    const res = await middleware(req("/admin/overview/save-field", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("**自己设个身份 cookie 也进不去** —— 身份 cookie 只在登录之后才算数", async () => {
    const res = await middleware(req("/admin/overview", { cookie: `admin_id=${LUCAS}` }));
    expect(res.status).toBe(307);
  });

  it("**伪造 x-admin-id 请求头也进不去**", async () => {
    const res = await middleware(req("/admin/overview", { headers: { "x-admin-id": LUCAS } }));
    expect(res.status).toBe(307);
  });

  it("不是 /admin 的页面照常放行，也不带身份", async () => {
    const res = await middleware(req("/login"));
    expect(res.status).toBe(200);
    expect(forwarded(res, "x-admin-id")).toBeNull();
  });
});

describe("登录了但不是管理员（客户 / 物主）", () => {
  it("开 /admin → 照样跳登录页", async () => {
    asCustomer();
    const res = await middleware(req("/admin/overview"));
    expect(res.status).toBe(307);
  });

  it("POST /admin 接口 → 401", async () => {
    asCustomer();
    const res = await middleware(req("/admin/overview/save-field", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("自己页面照常进，往下传的是**他自己的登录账号**（改动记录靠它认人），没有管理员身份", async () => {
    asCustomer();
    const res = await middleware(req("/provider", { headers: { "x-admin-id": LUCAS, "x-auth-uid": ADMIN_UID } }));
    expect(res.status).toBe(200);
    expect(forwarded(res, "x-auth-uid")).toBe(CUSTOMER_UID);
    expect(forwarded(res, "x-admin-id")).toBeNull();
  });
});

describe("管理员登录了", () => {
  it("放行，往下传他的管理员身份和登录账号", async () => {
    asAdmin(LUCAS);
    const res = await middleware(req("/admin/overview"));
    expect(res.status).toBe(200);
    expect(forwarded(res, "x-admin-id")).toBe(LUCAS);
    expect(forwarded(res, "x-auth-uid")).toBe(ADMIN_UID);
  });

  it("**浏览器带来的同名头被换掉**：传下去的只能是验过的", async () => {
    asAdmin(LUCAS);
    const res = await middleware(
      req("/admin/overview", { headers: { "x-admin-id": "evil", "x-auth-uid": CUSTOMER_UID } })
    );
    expect(forwarded(res, "x-admin-id")).toBe(LUCAS);
    expect(forwarded(res, "x-auth-uid")).toBe(ADMIN_UID);
  });

  it("标题旁边切了身份（cookie）→ 以切到的那个人干活，登录账号不变", async () => {
    asAdmin(LUCAS);
    const res = await middleware(req("/admin/overview", { cookie: `admin_id=${MUSHII}` }));
    expect(forwarded(res, "x-admin-id")).toBe(MUSHII);
    expect(forwarded(res, "x-auth-uid")).toBe(ADMIN_UID);
  });

  it("cookie 写坏了（不是 uuid）→ 退回登录的那个人", async () => {
    asAdmin(LUCAS);
    const res = await middleware(req("/admin/overview", { cookie: "admin_id=Admin1" }));
    expect(forwarded(res, "x-admin-id")).toBe(LUCAS);
  });

  it("**app_metadata 里写坏了的 admin_id 不算管理员**", async () => {
    claims = { sub: ADMIN_UID, app_metadata: { admin_id: "Admin1" } };
    const res = await middleware(req("/admin/overview"));
    expect(res.status).toBe(307);
  });
});
