// admin 登录的纯逻辑：哪些路径要管理员、登录 token 里怎么认出管理员、身份怎么往下传。
// middleware（edge）和服务端代码都 import，所以**不碰 next/headers、不碰数据库**。
//
// ## 「谁是管理员」存在哪
//
// 存在登录账号的 `app_metadata.admin_id` 里（指向 admins.id），**不在 admins 表上加
// auth_user_id 列**。理由是速度：middleware 每个 /admin 请求都要判断一次，
// app_metadata 在登录 token 里，本地验完签就有（1~3ms）；放表里就得每个请求查一次库，
// 本地连过去一次 0.3~1 秒。只存一处 —— 两处都存的话迟早对不上。
//
// app_metadata 只有 service key 改得了（用户自己 updateUser 改不动），所以信得过。
// 代价：取消一个人的管理员，要等他手上的 token 过期（默认 1 小时）才生效。
// 加 / 撤管理员走 `npm run admin:user`（scripts/admin-user.mjs）。
//
// ## 身份怎么往下传
//
// middleware 验完签，把结果写进**请求头**（ADMIN_ID_HEADER / AUTH_UID_HEADER）传给页面、
// Server Action、Route Handler，`lib/supabase.ts` 写库时再转给 PostgREST，改动记录的
// trigger 从那儿读「谁改的」。浏览器自己带来的同名头 middleware 先删掉，所以下游读到的
// 一定是验过的。库开了 RLS（0026）之后只有服务端连得上，转过去的头也就伪造不了。
//
// 「当前身份」（排期总览标题旁边的下拉）跟登录是两回事：登录决定能不能进，
// 进来以后身份随便切（pickAdminIdentity）。

/** 验过的管理员 id（admins.id）。middleware 写，下游读 */
export const ADMIN_ID_HEADER = "x-admin-id";
/** 验过的登录账号 id（auth.users.id）。客户 / 物主自己改东西时，改动记录靠它认人 */
export const AUTH_UID_HEADER = "x-auth-uid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 这个路径要不要管理员登录。`/admin` 本身和底下所有页面、Server Action、Route Handler */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** 登录 token 里的管理员 id。不是管理员（或者写的不是个 uuid）返回 null */
export function adminIdFromClaims(claims: { app_metadata?: unknown } | null | undefined): string | null {
  const meta = claims?.app_metadata;
  if (!meta || typeof meta !== "object") return null;
  const id = (meta as Record<string, unknown>).admin_id;
  return isUuid(id) ? id : null;
}

/**
 * 这次请求以哪个管理员的身份干活（写进 ADMIN_ID_HEADER 往下传）。
 *
 * - 没登录管理员账号：null（/admin 底下根本进不来）
 * - 登录了：标题旁边下拉选的那个（ADMIN_COOKIE），**谁登录都能切成任何一个**（用户定的）；
 *   没选过、或者 cookie 写的不是个 uuid，就是登录的那个人
 *
 * cookie 指向的管理员在不在 admins 里，这儿查不了（middleware 不查库）—— 页面上
 * resolveAdmin、库里 trigger 都会再对一遍，对不上当没有
 */
export function pickAdminIdentity(loginAdminId: string | null, cookieValue: string | undefined): string | null {
  if (!loginAdminId) return null;
  return isUuid(cookieValue) ? cookieValue : loginAdminId;
}

/**
 * 登录完要回到哪。只认站内的 /admin 路径 —— 不然 `?next=https://别的网站`
 * 就成了一个借我们登录页跳出去的跳板
 */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/admin/overview";
  const path = next.split(/[?#]/)[0];
  return isAdminPath(path) ? next : "/admin/overview";
}
