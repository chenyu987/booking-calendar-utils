import { matchesLocationFilter } from "./locations";

// 匹配台的逐列筛选。跟 lib/orderFilter.ts、lib/resourceFilter.ts 一个路子：
// 纯函数、不连数据库，页面把每一行整理好传进来，这里只判断「留不留」，所以能单测。
//
// 为什么这一页尤其需要筛：意向是**多对多**堆起来的 —— 一单被几个物主抢、
// 一个物主提好几单，行数涨得比订单快。而且很多行是死的（那一单早配齐了，
// 这条意向根本插不进去），不筛的话真正要处理的几条会被埋掉。

/** 意向状态。`open` 是个合成档：proposed + allowed，也就是「还没结的」 */
export type MatchStatusFilter = "" | "open" | "proposed" | "allowed" | "chosen" | "unfulfilled";
/** 分配进度：这一单还缺不缺资源 */
export type GapFilter = "" | "gap" | "full";

export type MatchFilters = {
  mstatus: MatchStatusFilter;
  ostatus: string;
  region: string;
  mtn: string;
  customer: string;
  /** 一个框同时搜物主和持有人 —— 找人的时候没人分得清自己记住的是哪一个 */
  resource: string;
  from: string;
  to: string;
  gap: GapFilter;
};

export const EMPTY_MATCH_FILTERS: MatchFilters = {
  mstatus: "",
  ostatus: "",
  region: "",
  mtn: "",
  customer: "",
  resource: "",
  from: "",
  to: "",
  gap: "",
};

const MSTATUS_VALUES: MatchStatusFilter[] = [
  "",
  "open",
  "proposed",
  "allowed",
  "chosen",
  "unfulfilled",
];
const GAP_VALUES: GapFilter[] = ["", "gap", "full"];

export const MATCH_STATUS_FILTER_LABELS: Record<MatchStatusFilter, string> = {
  "": "全部意向",
  open: "还没结的",
  proposed: "proposed",
  allowed: "allowed",
  chosen: "chosen",
  unfulfilled: "unfulfilled",
};

export const GAP_FILTER_LABELS: Record<GapFilter, string> = {
  "": "配没配齐都看",
  gap: "还缺资源的",
  full: "已经配齐的",
};

// URL 参数用户能随手改，认不出来的值一律当「没筛」，不报错
export function parseMatchFilters(sp: Record<string, string | undefined>): MatchFilters {
  const str = (v: string | undefined) => (v ?? "").trim();
  const oneOf = <T extends string>(v: string | undefined, allowed: T[]): T =>
    allowed.includes(str(v) as T) ? (str(v) as T) : ("" as T);
  return {
    mstatus: oneOf(sp.mstatus, MSTATUS_VALUES),
    ostatus: str(sp.ostatus),
    region: str(sp.region),
    mtn: str(sp.mtn),
    customer: str(sp.customer),
    resource: str(sp.resource),
    from: str(sp.from),
    to: str(sp.to),
    gap: oneOf(sp.gap, GAP_VALUES),
  };
}

export function hasAnyMatchFilter(f: MatchFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

export type FilterableMatch = {
  matchStatus: string;
  orderStatus: string | null;
  location: string | null;
  customerName: string | null;
  providerName: string | null;
  holderName: string | null;
  days: string[];
  /** 这一单配齐了没。没有订单就算不出来 */
  isComplete: boolean | null;
};

function contains(haystack: string | null, needle: string): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

/**
 * 日期筛的是**有没有交集**，不是「整段落在区间里」。
 *
 * 跟 Resource 那边的有效期筛选正好相反，是有意的：那边问的是「这个资源的有效期
 * 够不够宽」，这边问的是「这一单有没有落在我关心的这几天里」。一单 9/10-9/20，
 * 我筛 9/15 那一周，它当然该出现。
 */
function overlapsRange(days: string[], from: string, to: string): boolean {
  if (!from && !to) return true;
  if (days.length === 0) return false; // 没填日期的，一旦按日期筛就答不上
  return days.some((d) => (!from || d >= from) && (!to || d <= to));
}

export function matchesMatchFilters(m: FilterableMatch, f: MatchFilters): boolean {
  if (f.mstatus === "open") {
    if (m.matchStatus !== "proposed" && m.matchStatus !== "allowed") return false;
  } else if (f.mstatus && m.matchStatus !== f.mstatus) return false;

  if (f.ostatus && m.orderStatus !== f.ostatus) return false;
  if (!matchesLocationFilter(m.location, f)) return false;
  if (!contains(m.customerName, f.customer)) return false;
  // 物主和持有人任一命中就算
  if (f.resource && !contains(m.providerName, f.resource) && !contains(m.holderName, f.resource)) {
    return false;
  }
  if (!overlapsRange(m.days, f.from, f.to)) return false;

  if (f.gap === "gap" && m.isComplete !== false) return false;
  if (f.gap === "full" && m.isComplete !== true) return false;

  return true;
}
