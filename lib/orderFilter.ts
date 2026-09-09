// Order 列表页的逐列筛选。
//
// 纯函数，不连数据库：页面把每一行整理成 FilterableOrder（客人姓名、分配进度这些
// 派生的东西在页面那边算好），这里只负责判断"这一行留不留"。这样能单测。
//
// 为什么在内存里筛而不是写进 SQL：一个季 150~250 单，一次全捞回来才几十 KB；
// 而"配齐没配齐"是**算出来的**（CLAUDE.md：能算出来的东西不要存成字段），
// 日期是数组要判交集，这两条写成 SQL 既别扭又容易跟界面上的算法走偏。

export type PartyFilter = "" | "male" | "female" | "both";
export type AssignFilter = "" | "none" | "partial" | "full";

export type OrderFilters = {
  customer: string;
  location: string;
  party: PartyFilter;
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  assign: AssignFilter;
  status: string;
};

export const EMPTY_FILTERS: OrderFilters = {
  customer: "",
  location: "",
  party: "",
  from: "",
  to: "",
  minAmount: "",
  maxAmount: "",
  assign: "",
  status: "",
};

const PARTY_VALUES: PartyFilter[] = ["", "male", "female", "both"];
const ASSIGN_VALUES: AssignFilter[] = ["", "none", "partial", "full"];

// URL 参数是用户可以随手改的，认不出来的值一律当"没筛"，不要报错
export function parseOrderFilters(
  sp: Record<string, string | undefined>
): OrderFilters {
  const str = (v: string | undefined) => (v ?? "").trim();
  const oneOf = <T extends string>(v: string | undefined, allowed: T[]): T =>
    (allowed.includes(str(v) as T) ? (str(v) as T) : ("" as T));
  return {
    customer: str(sp.customer),
    location: str(sp.location),
    party: oneOf(sp.party, PARTY_VALUES),
    from: str(sp.from),
    to: str(sp.to),
    minAmount: str(sp.min),
    maxAmount: str(sp.max),
    assign: oneOf(sp.assign, ASSIGN_VALUES),
    status: str(sp.status),
  };
}

export function hasAnyFilter(f: OrderFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

export type FilterableOrder = {
  customerName: string;
  location: string | null;
  maleCount: number;
  femaleCount: number;
  demandDays: string[];
  amount: number | null;
  status: string;
  // 配了几个资源 / 要几张，页面那边用 computeNeed 算好传进来
  assignedCount: number;
  isComplete: boolean;
};

// 大小写不敏感的包含匹配。中文没有大小写，但地点和英文名有（locbg / Locbg）
function contains(haystack: string | null, needle: string): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

// 日期是数组、还可能不连续，所以判"有没有任何一天落在区间里"，
// 不是判起止点。只填一头就是单边开区间。
function overlapsRange(days: string[], from: string, to: string): boolean {
  if (!from && !to) return true;
  return days.some((d) => (!from || d >= from) && (!to || d <= to));
}

function matchesParty(o: FilterableOrder, party: PartyFilter): boolean {
  if (party === "") return true;
  if (party === "male") return o.maleCount > 0;
  if (party === "female") return o.femaleCount > 0;
  return o.maleCount > 0 && o.femaleCount > 0; // both
}

function matchesAssign(o: FilterableOrder, assign: AssignFilter): boolean {
  if (assign === "") return true;
  if (assign === "none") return o.assignedCount === 0;
  if (assign === "full") {
    // 光看 isComplete 不够：人数还没填的单子（男 0 女 0）在 computeNeed 眼里是
    // "要 0 张、配了 0 张 = 已配齐"，于是会同时落进"未分配"和"已配齐"两个筛选，
    // 自相矛盾。这类单子其实是还没录完，不该算配齐。
    return o.isComplete && o.maleCount + o.femaleCount > 0;
  }
  // partial：配了但没配齐
  return o.assignedCount > 0 && !o.isComplete;
}

// 金额筛选框是普通文本框（number 会带上下箭头，那么窄的格子装不下），
// 所以可能输进非数字。输了乱七八糟的东西就当这一头没填，不要把所有单子都筛没
// ——"我打错一个字，列表全空了"比"没筛上"难受得多。
function toBound(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function matchesAmount(amount: number | null, min: string, max: string): boolean {
  const lo = toBound(min);
  const hi = toBound(max);
  if (lo === null && hi === null) return true;
  // 金额没填的单子，一旦按金额筛就不该出现——它答不上这个问题
  if (amount === null || amount === undefined) return false;
  if (lo !== null && amount < lo) return false;
  if (hi !== null && amount > hi) return false;
  return true;
}

export function matchesOrderFilters(o: FilterableOrder, f: OrderFilters): boolean {
  return (
    contains(o.customerName, f.customer) &&
    contains(o.location, f.location) &&
    matchesParty(o, f.party) &&
    overlapsRange(o.demandDays ?? [], f.from, f.to) &&
    matchesAmount(o.amount, f.minAmount, f.maxAmount) &&
    matchesAssign(o, f.assign) &&
    (f.status === "" || o.status === f.status)
  );
}
