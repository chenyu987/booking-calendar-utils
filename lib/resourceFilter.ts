// Resource 列表页的逐列筛选。跟 lib/orderFilter.ts 一个路子：纯函数、不连数据库，
// 页面把每一行整理好传进来，这里只判断"留不留"，所以能单测。
//
// 一季的资源也就几十张，全捞回来在内存里筛就够了；而且"年龄"是从生日现算的
// （CLAUDE.md：能算出来的东西不要存成字段），写进 SQL 反而要在两处维护同一套算法。

import { BADGE_KINDS, BADGE_LABELS, type BadgeKind } from "./resourceStatus";

import { parseItemKinds } from "./itemKind";
import { matchesContactFilter } from "./admins";

/** 资源类型可以多选：URL 上逗号隔开的 ItemKind（lib/itemKind.ts），空 = 不筛 */
export type ItemFilter = string;

/**
 * 「挂牌状态」筛选按**显示出来的标签**比（`badgeKind`），不按库里的 `status`。
 * 外加一项「不可租」= 暂停 + 已过期 + 已下架，一次挑出所有眼下租不出去的（已删除不算，它另有一项）。
 * 老链接里的 active / paused / archived 照样认，意思不变（只是出租中不再含过期的）
 */
export type StatusFilter = "" | BadgeKind | "unavailable";
const UNAVAILABLE: BadgeKind[] = ["paused", "expired", "archived"];
export const STATUS_FILTER_OPTIONS: { value: Exclude<StatusFilter, "">; label: string }[] = [
  ...BADGE_KINDS.map((k) => ({ value: k, label: BADGE_LABELS[k] })),
  { value: "unavailable", label: "不可租（暂停/过期/下架）" },
];
const STATUS_VALUES: StatusFilter[] = ["", ...STATUS_FILTER_OPTIONS.map((o) => o.value)];
export type GenderFilter = "" | "male" | "female";
export type BookedFilter = "" | "yes" | "no";

export type ResourceFilters = {
  provider: string;
  item: ItemFilter;
  holder: string;
  gender: GenderFilter;
  ageMin: string;
  ageMax: string;
  validFrom: string;
  validTo: string;
  booked: BookedFilter;
  sstatus: StatusFilter;
  /** 物主地址（包含就算，比的是完整地址那一串） */
  addr: string;
  /** 谁的联系人：空 = 不筛，none = 还没标，其余是管理员 id（认不认得出由页面拿管理员名单再过一遍） */
  contact: string;
};

export const EMPTY_RESOURCE_FILTERS: ResourceFilters = {
  provider: "",
  item: "",
  holder: "",
  gender: "",
  ageMin: "",
  ageMax: "",
  validFrom: "",
  validTo: "",
  booked: "",
  sstatus: "",
  addr: "",
  contact: "",
};

/**
 * 挂牌状态**默认只看出租中**（2026-11-13 用户定的）：打开这一页多半是找能租的资源。
 * 所以 URL 上没写 sstatus = 出租中；要看全部得写 `sstatus=all`（下拉里的「全部状态」）。
 * 内部 `sstatus: ""` 仍然是「不筛」，只是 URL 上它叫 all。
 * 例外：带 `edit=<id>` 跳过来（排期总览双击卡片）又没写状态的，按全部 —— 要改的那个资源
 * 可能已经过期，默认筛掉的话点过来是一片空
 */
export const DEFAULT_RESOURCE_FILTERS: ResourceFilters = { ...EMPTY_RESOURCE_FILTERS, sstatus: "active" };

const GENDER_VALUES: GenderFilter[] = ["", "male", "female"];
const BOOKED_VALUES: BookedFilter[] = ["", "yes", "no"];

// URL 参数用户能随手改，认不出来的值一律当"没筛"，不报错
export function parseResourceFilters(
  sp: Record<string, string | undefined>
): ResourceFilters {
  const str = (v: string | undefined) => (v ?? "").trim();
  const oneOf = <T extends string>(v: string | undefined, allowed: T[]): T =>
    allowed.includes(str(v) as T) ? (str(v) as T) : ("" as T);
  return {
    provider: str(sp.provider),
    item: parseItemKinds(sp.item).join(","),
    holder: str(sp.holder),
    gender: oneOf(sp.gender, GENDER_VALUES),
    ageMin: str(sp.agemin),
    ageMax: str(sp.agemax),
    validFrom: str(sp.vfrom),
    validTo: str(sp.vto),
    addr: str(sp.addr),
    contact: str(sp.contact),
    booked: oneOf(sp.booked, BOOKED_VALUES),
    sstatus:
      str(sp.sstatus) === "all"
        ? ""
        : str(sp.sstatus) === ""
          ? str(sp.edit) ? "" : DEFAULT_RESOURCE_FILTERS.sstatus
          : STATUS_VALUES.includes(str(sp.sstatus) as StatusFilter)
            ? (str(sp.sstatus) as StatusFilter)
            : DEFAULT_RESOURCE_FILTERS.sstatus,
  };
}

/** 跟默认（只看出租中）比，有没有改过什么 */
export function hasAnyResourceFilter(f: ResourceFilters): boolean {
  return (Object.keys(f) as (keyof ResourceFilters)[]).some((k) => f[k] !== DEFAULT_RESOURCE_FILTERS[k]);
}

// 字段名 → URL 参数名（parseResourceFilters 的反方向）
const URL_KEYS: Record<keyof ResourceFilters, string> = {
  provider: "provider",
  item: "item",
  holder: "holder",
  gender: "gender",
  ageMin: "agemin",
  ageMax: "agemax",
  validFrom: "vfrom",
  validTo: "vto",
  booked: "booked",
  sstatus: "sstatus",
  addr: "addr",
  contact: "contact",
};

/**
 * 把筛选拼回查询串（带 `?`，什么都没有就是空串），extra 是额外要带的参数（比如 edit）。
 * 编辑 / 取消 / 保存都走它：原来这三处写死 `/admin/resources`，筛出一个资源点编辑，
 * 筛选全丢、回到整张表，得往下翻着找这个资源。空值不拼，跟 FilterForm 一样
 */
export function resourceFiltersQuery(f: ResourceFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const k of Object.keys(URL_KEYS) as (keyof ResourceFilters)[]) {
    if (k === "sstatus") continue;
    if (f[k]) params.set(URL_KEYS[k], f[k]);
  }
  // 状态：默认（出租中）不写，「不筛」写成 all（空着会被当成默认）
  if (f.sstatus !== DEFAULT_RESOURCE_FILTERS.sstatus) params.set("sstatus", f.sstatus || "all");
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * 保存后回哪：表单里带回来的查询串**重新按筛选解析一遍再拼**，不原样拼进跳转地址 ——
 * 那一串是浏览器交上来的，原样用的话改一下就能跳去别的地方。认不出来的参数一律丢掉
 */
export function resourceReturnPath(rawQuery: string): string {
  const sp = Object.fromEntries(new URLSearchParams(rawQuery.replace(/^\?/, "")));
  delete sp.edit; // 回列表是退出编辑态，别让 edit 把状态默认值改成「全部」
  return `/admin/resources${resourceFiltersQuery(parseResourceFilters(sp))}`;
}

export type FilterableResource = {
  providerName: string;
  /** itemKind(resource)：alpha / beta-base / beta-full / beta-unknown，类型没填是 null */
  itemKind: string | null;
  holderName: string | null;
  holderGender: string | null;
  age: number | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  bookingCount: number;
  /** 显示出来的那个标签（`badgeKind(resource)`），不是库里的 status */
  badge: BadgeKind;
  /** 物主的完整地址（formatAddress），没填是 null */
  address?: string | null;
  /** 物主挂在哪几个管理员名下（person_contacts） */
  contactIds?: string[];
};

// contains / matchesAge 也给 lib/providerFilter.ts 用（Provider 管理的逐列筛选同一套口径），别再抄一份
export function contains(haystack: string | null, needle: string): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

// 年龄框是普通文本框，可能输进非数字；解析不出来就当这一头没填，
// 别因为打错一个字把整张表筛空
function toBound(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function matchesAge(age: number | null, min: string, max: string): boolean {
  const lo = toBound(min);
  const hi = toBound(max);
  if (lo === null && hi === null) return true;
  // 没填生日就算不出年龄，一旦按年龄筛这个资源就答不上，不该出现
  if (age === null) return false;
  if (lo !== null && age < lo) return false;
  if (hi !== null && age > hi) return false;
  return true;
}

export function matchesResourceFilters(
  s: FilterableResource,
  f: ResourceFilters
): boolean {
  if (!contains(s.providerName, f.provider)) return false;
  if (f.item && !f.item.split(",").includes(s.itemKind ?? "")) return false;
  if (!contains(s.holderName, f.holder)) return false;
  if (f.gender && s.holderGender !== f.gender) return false;
  if (!matchesAge(s.age, f.ageMin, f.ageMax)) return false;
  // 有效期两头各自比较：起始日不早于、结束日不晚于。
  // 合起来就是"这个资源的有效期整段落在我给的区间里"。
  if (f.validFrom && (!s.rangeStart || s.rangeStart < f.validFrom)) return false;
  if (f.validTo && (!s.rangeEnd || s.rangeEnd > f.validTo)) return false;
  if (f.booked === "yes" && s.bookingCount === 0) return false;
  if (f.booked === "no" && s.bookingCount > 0) return false;
  if (!contains(s.address ?? null, f.addr)) return false;
  if (!matchesContactFilter(s.contactIds ?? [], f.contact)) return false;
  if (f.sstatus === "unavailable") {
    if (!UNAVAILABLE.includes(s.badge)) return false;
  } else if (f.sstatus && s.badge !== f.sstatus) return false;
  return true;
}
