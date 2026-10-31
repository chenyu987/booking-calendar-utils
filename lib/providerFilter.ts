// Provider 管理的逐列筛选。跟 lib/resourceFilter.ts 一个路子：纯函数、不连数据库，
// 页面把每一行整理好传进来，这里只判断「留不留」，所以能单测。
// 文字「包含就算」和年龄区间的口径直接用 resourceFilter 那两个，不另写。

import { CONTACT_FILTER_NONE, matchesContactFilter, type Admin } from "@/lib/admins";
import { contains, matchesAge } from "@/lib/resourceFilter";

export const PROVIDER_STATUSES = ["active", "inactive", "blacklisted"] as const;

export type ProviderFilters = {
  name: string;
  phone: string;
  chat: string;
  ageMin: string;
  ageMax: string;
  status: string;
  /** 空 = 不筛；none = 还没标的；其余是管理员 id */
  contact: string;
  address: string;
  note: string;
};

export const EMPTY_PROVIDER_FILTERS: ProviderFilters = {
  name: "",
  phone: "",
  chat: "",
  ageMin: "",
  ageMax: "",
  status: "",
  contact: "",
  address: "",
  note: "",
};

// 字段名 → URL 参数名。contact 沿用上一版就有的参数名，已经发出去的链接照样能用
const URL_KEYS: Record<keyof ProviderFilters, string> = {
  name: "name",
  phone: "phone",
  chat: "chat",
  ageMin: "agemin",
  ageMax: "agemax",
  status: "status",
  contact: "contact",
  address: "address",
  note: "note",
};

/**
 * URL 参数 → 筛选。用户能随手改 URL，认不出来的值一律当「没筛」，不报错：
 * 状态只认那三个，「谁的客人」只认 none 和真实存在的管理员 id
 */
export function parseProviderFilters(sp: Record<string, string | undefined>, admins: Admin[]): ProviderFilters {
  const str = (k: keyof ProviderFilters) => (sp[URL_KEYS[k]] ?? "").trim();
  const status = str("status");
  const contact = str("contact");
  return {
    name: str("name"),
    phone: str("phone"),
    chat: str("chat"),
    ageMin: str("ageMin"),
    ageMax: str("ageMax"),
    status: (PROVIDER_STATUSES as readonly string[]).includes(status) ? status : "",
    contact: contact === CONTACT_FILTER_NONE || admins.some((a) => a.id === contact) ? contact : "",
    address: str("address"),
    note: str("note"),
  };
}

export function hasAnyProviderFilter(f: ProviderFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

/** 筛选拼回查询串（带 `?`，什么都没有就是空串）。编辑 / 取消 / 保存都带着它，跟 Resource 管理一样 */
export function providerFiltersQuery(f: ProviderFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const k of Object.keys(URL_KEYS) as (keyof ProviderFilters)[]) {
    if (f[k]) params.set(URL_KEYS[k], f[k]);
  }
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * 保存后回哪：表单带回来的查询串**重新按筛选解析一遍再拼**，不原样拼进跳转地址 ——
 * 那一串是浏览器交上来的。认不出来的参数一律丢掉，永远停在 /admin/providers
 */
export function providerReturnPath(rawQuery: string, admins: Admin[]): string {
  const sp = Object.fromEntries(new URLSearchParams(rawQuery.replace(/^\?/, "")));
  return `/admin/providers${providerFiltersQuery(parseProviderFilters(sp, admins))}`;
}

export type FilterableProvider = {
  chatName: string | null;
  /** 自己注册时填的称呼。列表上跟昵称挤在同一格，所以按名字筛两个都算 */
  selfName: string | null;
  phone: string | null;
  chatId: string | null;
  age: number | null;
  status: string | null;
  contactIds: string[];
  /** formatAddress 拼好的一行，跟列表上显示的是同一串 */
  address: string | null;
  note: string | null;
};

export function matchesProviderFilters(o: FilterableProvider, f: ProviderFilters): boolean {
  if (f.name && !contains(o.chatName, f.name) && !contains(o.selfName, f.name)) return false;
  if (!contains(o.phone, f.phone)) return false;
  if (!contains(o.chatId, f.chat)) return false;
  if (!matchesAge(o.age, f.ageMin, f.ageMax)) return false;
  if (f.status && o.status !== f.status) return false;
  if (!matchesContactFilter(o.contactIds, f.contact)) return false;
  if (!contains(o.address, f.address)) return false;
  if (!contains(o.note, f.note)) return false;
  return true;
}
