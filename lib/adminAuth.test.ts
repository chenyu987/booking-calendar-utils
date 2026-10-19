import { describe, expect, it } from "vitest";
import { adminIdFromClaims, isAdminPath, pickAdminIdentity, safeAdminNext } from "./adminAuth";

const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

describe("isAdminPath", () => {
  it("/admin 和底下所有路径都要管理员", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/overview")).toBe(true);
    expect(isAdminPath("/admin/overview/save-field")).toBe(true);
  });
  it("长得像的别的路径不算 —— 不然 /administrator 之类会被误拦，/login/admin 会把自己拦死", () => {
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/login/admin")).toBe(false);
    expect(isAdminPath("/provider")).toBe(false);
  });
});

describe("adminIdFromClaims", () => {
  it("app_metadata.admin_id 是个 uuid 就是管理员", () => {
    expect(adminIdFromClaims({ app_metadata: { admin_id: ID } })).toBe(ID);
  });
  it("客户 / 物主（没有 admin_id）、没登录、写坏了的，都不是", () => {
    expect(adminIdFromClaims({ app_metadata: { provider: "email" } })).toBeNull();
    expect(adminIdFromClaims(null)).toBeNull();
    expect(adminIdFromClaims({ app_metadata: { admin_id: "Admin1" } })).toBeNull();
    expect(adminIdFromClaims({ app_metadata: { admin_id: true } })).toBeNull();
  });
  it("**user_metadata 里写的不算** —— 那一格用户自己就能改", () => {
    expect(adminIdFromClaims({ user_metadata: { admin_id: ID } } as any)).toBeNull();
  });
});

describe("pickAdminIdentity（当前身份）", () => {
  const OTHER = "9c0e6f8a-1d2b-4c3d-8e4f-5a6b7c8d9e0f";
  it("登录了：下拉选了谁就是谁 —— 谁登录都能切成任何一个", () => {
    expect(pickAdminIdentity(ID, OTHER)).toBe(OTHER);
  });
  it("登录了、没选过（或 cookie 是坏的）：就是登录的那个人", () => {
    expect(pickAdminIdentity(ID, undefined)).toBe(ID);
    expect(pickAdminIdentity(ID, "Admin1")).toBe(ID);
  });
  it("**没登录管理员账号，cookie 写什么都没用** —— 不然自己设个 cookie 就进后台了", () => {
    expect(pickAdminIdentity(null, OTHER)).toBeNull();
  });
});

describe("safeAdminNext", () => {
  it("站内 /admin 路径原样回去，带参数也行", () => {
    expect(safeAdminNext("/admin/customers?edit=1")).toBe("/admin/customers?edit=1");
  });
  it("**跳到别的网站的一律不认** —— 不然登录页成了钓鱼跳板", () => {
    expect(safeAdminNext("https://evil.example/admin")).toBe("/admin/overview");
    expect(safeAdminNext("//evil.example/admin")).toBe("/admin/overview");
    expect(safeAdminNext("/provider")).toBe("/admin/overview");
    expect(safeAdminNext(null)).toBe("/admin/overview");
  });
});
