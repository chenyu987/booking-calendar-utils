import { requiredItem, sameVenue, type ItemType } from "./locations";


export const REQUEST_STATUSES = ["new", "contacted", "won", "ignored"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: "新的",
  contacted: "已联系",
  won: "成交",
  ignored: "不跟",
};

/** 表单 / URL 里来的状态。认不出来的给 null，不猜 —— 跟库里的 check 是同一份名单 */
export function parseRequestStatus(raw: unknown): RequestStatus | null {
  return REQUEST_STATUSES.includes(raw as RequestStatus) ? (raw as RequestStatus) : null;
}

/** 管理员备注的上限。写多了是贴错了东西，不是真要记这么多 */
export const REQUEST_NOTE_MAX = 500;

export type RequestPerson = { id: string; chat_name?: string | null; chat_id?: string | null };

// **精确匹配**（2026-10-24 用户定的）：只去掉两头的空白，中间的空格、大小写都算数。
// 页面也是拿这一页的名字去库里 `.in(...)` 精确查的，两边口径一致。
const norm = (v?: string | null) => (v ?? "").trim();

/**
 * 发言人对得上哪个老客户 —— **现算不存**（0029 顶上说了为什么）。
 *
 * 跟 referral.ts 的 resolveCustomer 同一个口径：先比昵称，再比账号，哪一档对上了就只看那一档；
 * **对上多个就当没对上**。猜错一个人，运营会拿着别人的历史单子去聊，比不提示还糟。
 *
 * 只是提示：群里显示的可能是群昵称，不是昵称，对不上不代表是新客人。
 */
export function matchRequestPerson<P extends RequestPerson>(sender: string, people: P[]): P | null {
  const q = norm(sender);
  if (!q) return null;
  for (const field of ["chat_name", "chat_id"] as const) {
    const hits = people.filter((p) => norm(p[field]) === q);
    if (hits.length) return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

/** "03-14","03-15" → "3/14、3/15"。年份模型不知道（0029），所以不显示 */
export function formatRequestDates(dates?: string[] | null): string {
  return (dates ?? [])
    .map((d) => {
      const m = /^(\d{1,2})-(\d{1,2})$/.exec(d);
      return m ? `${Number(m[1])}/${Number(m[2])}` : d;
    })
    .join("、");
}

/** 男女人数。物品登记了使用人，性别是硬条件，所以分开写 */
export function formatRequestParty(male?: number | null, female?: number | null): string {
  const parts = [male ? `男${male}` : "", female ? `女${female}` : ""].filter(Boolean);
  return parts.join(" ") || "—";
}

/**
 * 类型：模型只抄消息里写了的（没写就是 unknown，0029 不让它猜），但地点名已经定了类型 ——
 * Loccx 只收 Beta。这里拿 lib/locations.ts 的场地库**现算**，不回写库。
 *
 * - 没写类型、地点都是同一边的：`item` 是那一边，`inferred` = true
 * - 写了类型、但地点是另一边的：**按地点**（`item` 是地点要的那种，`inferred` = true），
 *   `conflict` 是他说的那种 —— 人写错了，或者模型抄错了，跟进前问一句
 * - 地点认不出来、或者几个地点两边都有：照他说的，不猜
 */
export function requestItem(
  itemType: string | null | undefined,
  location: string | null | undefined
): { item: ItemType | null; inferred: boolean; conflict: ItemType | null } {
  const parts = (location ?? "").split(/[\/、,，+&]| and |和/i);
  const needs = new Set(
    [requiredItem(location), ...parts.map((p) => requiredItem(p))].filter((p): p is ItemType => !!p)
  );
  const only = needs.size === 1 ? [...needs][0] : null;
  const said = itemType === "beta" || itemType === "alpha" ? itemType : null;
  if (only && only !== said) return { item: only, inferred: true, conflict: said };
  return { item: said ?? only, inferred: false, conflict: null };
}


// —— 筛选（需求页顶上那一排）——
//
// 搜索和查重用宽松的比法（去空格、不分大小写）；老客户匹配那个 norm 是精确的（#128），别混用。
const loose = (v?: string | null) => (v ?? "").replace(/\s+/g, "").toLowerCase();
//
// 跟 Order 列表一个做法（lib/orderFilter.ts）：页面拉回最近一批，**在内存里筛**。
// 类型是按地点现算的（requestItem），写成 SQL 就得在库里再抄一份场地库；群、发言人、日期在内存里筛也就毫秒级。
// URL 参数是人能随手改的，认不出来的值一律当「没筛」。

export type RequestFilters = {
  status: RequestStatus | "all";
  /** chat_groups.id；"none" = 没挂到群上的（0030 之前进来的） */
  group: string;
  /** 发言人名字里含这几个字，不分大小写、不管空格 */
  sender: string;
  /** 按 requestItem 算出来的类型，按地点推的也算 */
  item: "" | ItemType;
  /** 地点名：场地库认得的按同一个场地比（locaj = akaad），认不得的按字面包含 */
  location: string;
  /** 活动日，YYYY-MM-DD。需求的日期没有年份（0029），只比月日 */
  day: string;
  /** 要男资源 / 要女资源 / 都要 */
  party: "" | "male" | "female" | "both";
  /** 抓到的日期，YYYY-MM-DD，两头都含。按 UTC 算，跟 lib/dates.ts 的 todayIso 一致 */
  from: string;
  to: string;
  /** 按哪个时间排：抓到的时间，或者消息在群里发出的时间（sent_time，0031） */
  sort: RequestSort;
  dir: "asc" | "desc";
};

export type RequestSort = "captured" | "sent" | "total";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRequestFilters(sp: Record<string, string | undefined>): RequestFilters {
  const str = (v: string | undefined) => (v ?? "").trim();
  const group = str(sp.group);
  const item = str(sp.item);
  return {
    status: str(sp.status) === "all" ? "all" : parseRequestStatus(str(sp.status)) ?? "new",
    group: group === "none" || UUID.test(group) ? group : "",
    sender: str(sp.sender).slice(0, 60),
    item: item === "beta" || item === "alpha" ? item : "",
    location: str(sp.location).slice(0, 60),
    day: ISO_DAY.test(str(sp.day)) ? str(sp.day) : "",
    party: (["male", "female", "both"] as const).find((p) => p === str(sp.party)) ?? "",
    from: ISO_DAY.test(str(sp.from)) ? str(sp.from) : "",
    to: ISO_DAY.test(str(sp.to)) ? str(sp.to) : "",
    sort: str(sp.sort) === "sent" || str(sp.sort) === "total" ? (str(sp.sort) as RequestSort) : "captured",
    dir: str(sp.dir) === "asc" ? "asc" : "desc",
  };
}

/** 筛选 → URL 参数。默认值（状态「新的」）和空的不写，地址栏一眼看得出筛了什么 */
export function requestFiltersQuery(f: RequestFilters, overrides: Partial<RequestFilters> = {}): string {
  const all = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (all.status !== "new") params.set("status", all.status);
  for (const k of ["group", "sender", "item", "location", "day", "party", "from", "to"] as const) if (all[k]) params.set(k, all[k]);
  // 默认「按抓到时间，新的在上」不写
  if (all.sort !== "captured") params.set("sort", all.sort);
  if (all.dir !== "desc") params.set("dir", all.dir);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type FilterableRequest = {
  status: string;
  group_id: string | null;
  sender: string;
  item_type: string | null;
  location: string | null;
  dates?: string[] | null;
  male?: number | null;
  female?: number | null;
  captured_at: string | null;
  created_at: string;
};

/** 状态以外的筛选。状态单独比，是因为顶上那排标签要数「其他条件不变、换个状态有几条」 */
export function keepRequest(r: FilterableRequest, f: RequestFilters): boolean {
  if (f.group === "none" ? r.group_id : f.group && r.group_id !== f.group) return false;
  if (f.sender && !loose(r.sender).includes(loose(f.sender))) return false;
  if (f.item && requestItem(r.item_type, r.location).item !== f.item) return false;
  if (f.location && !locationMatches(r.location, f.location)) return false;
  if (f.day && !(r.dates ?? []).includes(f.day.slice(5))) return false;
  if (f.party === "male" && !r.male) return false;
  if (f.party === "female" && !r.female) return false;
  if (f.party === "both" && !(r.male && r.female)) return false;
  if (f.from || f.to) {
    const day = new Date(r.captured_at ?? r.created_at).toISOString().slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  return true;
}

/**
 * 排序。按群里时间排时，推不出时间的（sent_time、sent_guess 都空）**不管升降都放最后** ——
 * 它们不是「最早」也不是「最晚」，是不知道，混在中间会让人以为排错了。
 */
export function sortRequests<
  R extends { captured_at: string | null; created_at: string; sent_time?: string | null; sent_guess?: string | null }
>(
  rows: R[],
  f: Pick<RequestFilters, "sort" | "dir">,
  /** 按估价排时，每一行的估价（estimateTotal 算好的；估不出的给 null） */
  totalOf: (r: R) => number | null = () => null
): R[] {
  const key = (r: R): number | null => {
    if (f.sort === "total") return totalOf(r);
    const at = f.sort === "sent" ? r.sent_time ?? r.sent_guess ?? null : r.captured_at ?? r.created_at;
    return at ? Date.parse(at) : null;
  };
  const sign = f.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null || y === null) return x !== null ? -1 : y !== null ? 1 : 0;
    return sign * (x - y);
  });
}

// —— 群里时间推算 ——

const ABS_SENT = /^(?:(\d{4})[\/\-年.])?(\d{1,2})[\/\-月.](\d{1,2})日?\s+(\d{1,2}):(\d{2})$/;

function parseAbsSent(raw: string | null | undefined) {
  const m = ABS_SENT.exec((raw ?? "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1] ? Number(m[1]) : null, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { y, mo, d, h, mi };
}

/**
 * 采集 Mac 的时区（离 UTC 几分钟），从已经推好 sent_time 的行里反推：原文的「墙上时间」减去真实时刻。
 * 取出现最多的那个值，几条推错的带不偏。一条能对的都没有给 null。
 */
export function sentOffsetMinutes(rows: { sent_at?: string | null; sent_time?: string | null }[]): number | null {
  const votes = new Map<number, number>();
  for (const r of rows) {
    const p = parseAbsSent(r.sent_at);
    if (!p || !r.sent_time) continue;
    const at = new Date(r.sent_time);
    if (isNaN(at.getTime())) continue;
    const wall = Date.UTC(p.y ?? at.getUTCFullYear(), p.mo - 1, p.d, p.h, p.mi);
    // 没写年份的，跨年那几个小时会差出一年；挑离真实时刻最近的那一年
    const cands = p.y ? [wall] : [-1, 0, 1].map((k) => Date.UTC(at.getUTCFullYear() + k, p.mo - 1, p.d, p.h, p.mi));
    const off = cands.map((w) => Math.round((w - at.getTime()) / 60000)).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    if (Math.abs(off) > 14 * 60) continue; // 世界上没有这么大的时差，是原文跟 sent_time 对不上
    votes.set(off, (votes.get(off) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [off, n] of votes) if (best === null || n > votes.get(best)!) best = off;
  return best;
}

/**
 * 原文 → 真实时刻（ISO），推不出给 null。`refIso` 是抓到的时间（没有就入库时间），年份按它定：
 * 不晚于它的最近一年。`offsetMin` 是 sentOffsetMinutes 反推出来的时区。
 */
export function inferSentTime(sentAt: string | null | undefined, refIso: string, offsetMin: number | null): string | null {
  if (offsetMin === null) return null;
  const p = parseAbsSent(sentAt);
  const ref = Date.parse(refIso);
  if (!p || isNaN(ref)) return null;
  const at = (y: number) => Date.UTC(y, p.mo - 1, p.d, p.h, p.mi) - offsetMin * 60000;
  if (p.y) return new Date(at(p.y)).toISOString();
  const refYear = new Date(ref + offsetMin * 60000).getUTCFullYear();
  const t = at(refYear) <= ref ? at(refYear) : at(refYear - 1);
  return new Date(t).toISOString();
}

/**
 * 估总价 = 每天单价 × 天数 × 人数，**现算不存**：单价是需求页上调的（app_settings），
 * 调一次所有估价跟着变。类型用 requestItem（按地点推的也算）。
 * 类型推不出、那个类型没设单价、日期没说、人数没说 —— 都估不出来，给 null，**不猜**：
 * 拿 1 天 1 人去估，排序时会把一个可能是大单的排到最后。
 */
export function estimateTotal(
  r: { item_type: string | null; location: string | null; dates?: string[] | null; male?: number | null; female?: number | null },
  prices: { beta: number | null; alpha: number | null }
): { total: number; price: number; days: number; people: number } | null {
  const item = requestItem(r.item_type, r.location).item;
  const price = item ? prices[item] : null;
  const days = (r.dates ?? []).length;
  const people = (r.male ?? 0) + (r.female ?? 0);
  if (!price || !days || !people) return null;
  return { total: Math.round(price * days * people * 100) / 100, price, days, people };
}

/** 批量改状态一次最多几条：页面一次只显示 300 条，多出来的是表单被人改过 */
export const BULK_MAX = 500;

/** 批量勾选的 id：只要 uuid、去重。勾选集是浏览器里攒的，可能夹着别的东西 */
export function parseBulkIds(raw: FormDataEntryValue[]): string[] {
  return [...new Set(raw.map(String).filter((id) => UUID.test(id)))].slice(0, BULK_MAX);
}

/** 需求里的地点可能是「loccw, loccx」好几个，有一个对上就算 */
function locationMatches(raw: string | null, q: string): boolean {
  if (!raw) return false;
  if (loose(raw).includes(loose(q))) return true;
  return raw.split(/[\/、,，+&]| and |和/i).some((part) => sameVenue(part, q));
}

// —— 群名单（迁移 0030）——

export const GROUP_NAME_MAX = 80;
export const GROUP_NOTE_MAX = 200;

/**
 * 加群 / 改群的表单。名字**原样存**（只去头尾空格）：采集器拿它去聊天左栏里找，
 * 要跟聊天里显示的一字不差，这里替人「规范化」一下反而找不到了。
 * 重名按去空格、不分大小写比 —— 聊天左栏里这两个本来就分不清。
 */
export function parseGroupForm(
  formData: FormData,
  existing: { id: string; name: string }[],
  selfId?: string
): { ok: true; name: string; active: boolean; note: string | null } | { ok: false; error: "empty" | "dup" | "long" } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "empty" };
  if (name.length > GROUP_NAME_MAX) return { ok: false, error: "long" };
  if (existing.some((g) => g.id !== selfId && loose(g.name) === loose(name))) return { ok: false, error: "dup" };
  const note = String(formData.get("note") ?? "").trim().slice(0, GROUP_NOTE_MAX);
  // 复选框不勾就不出现在表单里；加群默认就是在抓
  const active = selfId ? formData.get("active") === "on" : formData.get("active") !== "off";
  return { ok: true, name, active, note: note || null };
}
