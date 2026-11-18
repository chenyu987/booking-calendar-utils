import { parseOrderAdminFilter, type Admin } from "@/lib/admins";
import { STATUS_LABELS } from "@/lib/orderStatus";
import { parseResourceSort, DEFAULT_RESOURCE_SORT } from "@/lib/resourceSort";
import type { Region } from "@/lib/locations";
import type { OrderFilter, ResourceFilter } from "@/lib/overviewModel";

// 排期总览地址栏上的筛选：怎么读、链接怎么拼。**服务端（page.tsx）和浏览器（OverviewBoard）共用这一份**。
//
// 2026-11-18 起切筛选不回服务端：地址栏就是筛选的唯一出处，选完只改地址栏（replaceState），
// 浏览器从地址栏读出来当场重算（lib/overviewModel.ts）。只有换季要回服务端（要另一季的数据）。

/** URLSearchParams、Next 的 ReadonlyURLSearchParams 都满足 */
export type QueryLike = { get(key: string): string | null };

export function parseOverviewQuery(q: QueryLike, admins: Admin[]) {
  const g = (k: string) => q.get(k) ?? "";
  const resourceFilter: ResourceFilter = {
    item: g("item"),
    gender: g("gender"),
    // 挂牌状态默认只看「出租中」——暂停和已下架的平时不该占地方
    sstatus: g("sstatus") || "active",
    q: g("q").trim().toLowerCase(),
    // 上次去的区域 / 具体的地点。"none" 是「只看还没排过的」那一档
    sregion: g("sregion"),
    smtn: g("smtn"),
  };
  const orderFilter: OrderFilter = {
    region: g("region") as Region | "",
    mtn: g("mtn"),
    // 不在白名单里的值一律当没筛（URL 是人能随便改的）
    status: STATUS_LABELS[g("ostatus")] ? g("ostatus") : "",
    // 这一单是哪个管理员的（orders.admin_id，0019）。日历和统计一起筛
    admin: parseOrderAdminFilter(g("oadmin") || undefined, admins),
  };
  return {
    resourceFilter,
    orderFilter,
    hasOrderFilter: Boolean(orderFilter.region || orderFilter.mtn || orderFilter.status || orderFilter.admin),
    sortBy: parseResourceSort(g("ssort") || undefined),
    showAllCards: g("allcards") === "1",
  };
}

/** 地址栏上会带着走的那几个参数（顺序就是拼出来的顺序） */
const KEYS = [
  "season",
  "item",
  "gender",
  "sstatus",
  "q",
  "sregion",
  "smtn",
  "ssort",
  "assign",
  "allcards",
  "region",
  "mtn",
  "ostatus",
  "oadmin",
] as const;

/**
 * 在当前筛选的基础上改几个参数拼一条排期总览的链接。extra 里空字符串 = 去掉这个参数。
 * 默认值（sstatus=active、默认排序）不写进 URL，链接短一点
 */
export function overviewHref(q: QueryLike, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of KEYS) {
    const v = k in extra ? extra[k] : q.get(k) ?? "";
    if (!v) continue;
    if (k === "sstatus" && v === "active") continue;
    if (k === "ssort" && v === DEFAULT_RESOURCE_SORT) continue;
    p.set(k, v);
  }
  const s = p.toString();
  return s ? `/admin/overview?${s}` : "/admin/overview";
}
