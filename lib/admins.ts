// 管理员（迁移 0018）的纯逻辑：表单值怎么认、改的时候要加哪几条删哪几条、列表怎么筛、
// 当前身份存在哪个 cookie。登录相关（谁能进后台）在 lib/adminAuth.ts。
//
// 每个管理员对应一个加客人用的账号（Admin1 = 私人号，admin2 = 工作号），
// 所以「这个客人是谁的」跟「哪个号加的」是同一件事。
//
// **不碰数据库**，客户端组件（CustomerTable、AdminSwitcher）也要 import ——
// 读写库的在 lib/personContacts.ts。

export type Admin = { id: string; name: string };

/** 管理员名最长多少字。表格里那个小标签放不下太长的 */
export const ADMIN_NAME_MAX = 20;

/**
 * 「我现在以哪个管理员的身份干活」存在这个 cookie 里，**每台电脑各记各的**（跟暗色模式一样）。
 *
 * 登录（lib/adminAuth.ts）只管**能不能进后台**；进来以后身份随便切 —— 2026-10-19 用户定的：
 * 不管哪个管理员登录，都能切成任何一个。没切过（没有这个 cookie）就是登录的那个人。
 * 改动记录两样都留：x-admin-id 是切到的身份，x-auth-uid 是真正登录的账号。
 */
export const ADMIN_COOKIE = "admin_id";

/**
 * 当前身份的 id 对应哪个管理员。没有、或者 admins 那一行已经不在了，都是 null ——
 * 不能拿一个不存在的 id 去记归属
 */
export function resolveAdmin(adminId: string | undefined, admins: Admin[]): Admin | null {
  if (!adminId) return null;
  return admins.find((a) => a.id === adminId) ?? null;
}

/**
 * 表单里勾的那几个管理员 → id 列表，或者一句为什么不行。
 * **认不出来的 id 直接拒掉**，不悄悄丢掉：界面上只给勾真实存在的管理员，
 * 出现别的 id 说明是旧页面或者有人直接 POST —— 静悄悄丢掉的话，
 * 这个人原来挂的那个管理员会被当成「取消勾选」删掉。
 */
export function parseAdminIds(
  raw: unknown[],
  admins: Admin[]
): { ok: true; ids: string[] } | { ok: false; reason: string } {
  const known = new Set(admins.map((a) => a.id));
  const ids: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !known.has(v)) {
      return { ok: false, reason: "「谁的客人」里有一个管理员认不出来，刷新页面再试" };
    }
    if (!ids.includes(v)) ids.push(v);
  }
  return { ok: true, ids };
}

/**
 * 从现在挂着的几个改到勾选的几个，要加哪些、删哪些。
 * 只动有变化的那几条 —— 全删再全插的话，中间一步失败这个人的归属就全没了
 */
export function contactsDiff(current: string[], next: string[]): { add: string[]; remove: string[] } {
  return {
    add: next.filter((id) => !current.includes(id)),
    remove: current.filter((id) => !next.includes(id)),
  };
}

/** 管理员名：去掉两头空格，不能空、不能太长。重名交给库里的 unique 拦 */
export function parseAdminName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { ok: false, reason: "名字不能空着" };
  if (name.length > ADMIN_NAME_MAX) return { ok: false, reason: `名字最多 ${ADMIN_NAME_MAX} 个字` };
  return { ok: true, name };
}

/** 列表上按管理员筛：空 = 不筛，NONE = 一个都没标的，其余是某个管理员的 id */
export const CONTACT_FILTER_NONE = "none";

export function matchesContactFilter(adminIds: string[], filter: string): boolean {
  if (!filter) return true;
  if (filter === CONTACT_FILTER_NONE) return adminIds.length === 0;
  return adminIds.includes(filter);
}

/**
 * 排期总览按「这一单是哪个管理员的」筛（URL 参数 oadmin）。
 * 值：空 = 不筛，CONTACT_FILTER_NONE = 没标的，其余是管理员 id。
 * 比的是**算出来的归属**（lib/orderFrame.ts 的 effectiveAdminId：没写是谁的算主要管理员的），
 * 所以设了主要管理员之后「没标」就筛不出东西了 —— 页面上那时也不给这个选项
 * **认不出来的值一律当没筛**（URL 是人能随手改的；管理员改了名 id 不变，不受影响）
 */
export function parseOrderAdminFilter(raw: string | undefined, admins: Admin[]): string {
  const v = (raw ?? "").trim();
  if (v === CONTACT_FILTER_NONE) return v;
  return admins.some((a) => a.id === v) ? v : "";
}

export function matchesOrderAdmin(adminId: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === CONTACT_FILTER_NONE) return !adminId;
  return adminId === filter;
}

/** 库里存的主要管理员 id 对不对得上名单里的人。对不上（手工改坏了、那个人没了）就当没设 */
export function resolvePrimaryAdmin(raw: string | null | undefined, admins: Admin[]): string | null {
  return raw && admins.some((a) => a.id === raw) ? raw : null;
}
