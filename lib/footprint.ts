// Customer 足迹：这个人以前哪几天在哪个地点用过。
//
// 全部现算，不存字段 —— 数据源就是 orders 的 demand_days + location，
// 存一份「足迹」到 customers 上，改单的时候必然忘同步（这项目栽过四次的那个坑）。
import { contiguousRuns, shortLabel } from "./dates";
import { seasonOf } from "./season";

// 取消/未确认的单子照样算进足迹：「这人黄过一单」本身是有用信息，
// 只是界面上灰掉，跟正常单区分开。
// needRefund 不在这里 —— 人是真用了，只是欠一笔退款，属于正常足迹。
const INACTIVE_STATUSES = new Set(["cancelled", "unconfirmed"]);

export type FootprintOrder = {
  customer_id: string;
  demand_days: string[] | null;
  location: string | null;
  status: string | null;
};

export type FootprintSegment = {
  // 显示用：「1/18~1/19 locbl」
  label: string;
  // 排序用的 ISO 起始日
  start: string;
  // cancelled / unconfirmed，界面上灰掉
  inactive: boolean;
  // 这一段属于哪一季（lib/season.ts）。按**这一单的第一天**算，一单的几段都归同一季 ——
  // 跟排期总览「季流水」同一把尺（跨季的单整单算进开始那季，不按天拆）
  season: SeasonTag;
};

/** 一季：key 是 25-26-na，label 是「25-26 A 区」，start 用来排先后 */
export type SeasonTag = { key: string; label: string; start: string };

/** 这个人在某一季的情况：inactive = 这季的单全是取消/未确认的（标签灰掉划线） */
export type CustomerSeason = SeasonTag & { inactive: boolean };

export type CustomerFootprint = {
  segments: FootprintSegment[];
  // 去过哪几季，新的在前。现算，不存字段（能算出来的不存）
  seasons: CustomerSeason[];
  // 单数，不是段数 —— 一单日期不连续会拆成好几段（只用 24、25、27）
  orderCount: number;
  // 其中真用了的（不算取消/未确认）。按「来得最多」排序用
  activeOrderCount: number;
  // 客户端筛选用的小写全文，日期和地点都能搜
  searchText: string;
};

// 一个订单可能拆成多段：demand_days 是日期数组不是区间，实际有不连续的情况
export function orderSegments(order: FootprintOrder): FootprintSegment[] {
  const days = order.demand_days ?? [];
  if (days.length === 0) return [];

  const inactive = INACTIVE_STATUSES.has(order.status ?? "");
  const location = (order.location ?? "").trim();
  const season = seasonTag([...days].sort()[0]);

  return contiguousRuns(days).map((run) => {
    const first = shortLabel(run[0]).date;
    const range =
      run.length === 1
        ? first
        : `${first}~${shortLabel(run[run.length - 1]).date}`;
    return {
      label: location ? `${range} ${location}` : range,
      start: run[0],
      inactive,
      season,
    };
  });
}

function seasonTag(day: string): SeasonTag {
  const s = seasonOf(day);
  return { key: s.key, label: s.label, start: s.start };
}

/**
 * 足迹那一格收起来时的一行：「最早一段 … 最近一段　N 单」（跟 Resource 管理的排期列一个样子）。
 * segments 是倒序的（最近的在前）。两段用「、」连，三段以上用「…」，一段就只有它自己
 */
export function summarizeFootprint(segments: FootprintSegment[]): {
  earliest: FootprintSegment | null;
  latest: FootprintSegment | null;
  joiner: "" | "、" | "…";
} {
  if (segments.length === 0) return { earliest: null, latest: null, joiner: "" };
  if (segments.length === 1) return { earliest: null, latest: segments[0], joiner: "" };
  return {
    earliest: segments[segments.length - 1],
    latest: segments[0],
    joiner: segments.length === 2 ? "、" : "…",
  };
}

/**
 * 点开足迹那个浮层：按季分组，「25-26 A 区」当小标题（段上的日子只写「月/日」，
 * 历年的数据导进来以后，不分季就分不清 12/24 是哪年的 12/24）。
 * 原来按自然年分，一个A 区季跨两年，12 月和 1 月被拆进两组 —— 按季才跟业务对得上，
 * 也跟列表上那一列季标签是同一套叫法。
 * 新的季在前，组内顺序不动（segments 本来就是最近在前）
 */
export function groupSegmentsBySeason(
  segments: FootprintSegment[]
): { season: SeasonTag; segments: FootprintSegment[] }[] {
  // 按季归拢而不是只看相邻的：跨季的单整单归开始那季，它的后几段可能夹在下一季的段中间
  const groups = new Map<string, { season: SeasonTag; segments: FootprintSegment[] }>();
  for (const s of segments) {
    const g = groups.get(s.season.key);
    if (g) g.segments.push(s);
    else groups.set(s.season.key, { season: s.season, segments: [s] });
  }
  return [...groups.values()].sort((a, b) => b.season.start.localeCompare(a.season.start));
}

/**
 * Customer 列表按足迹排序。「来过」只算真用了的段（取消/未确认的不算 —— 不然一个只黄过一单的人
 * 会排在真来过的人前面）。一次都没来过的一律排最后。
 *   - default：不动，保持传进来的顺序（页面上是最近添加的在前）
 *   - recent：最近一次来的日子，越近越前
 *   - earliest：第一次来的日子，越早越前（找老客户）
 *   - most：真用了的单数从多到少，一样多的最近来过的在前
 */
export const FOOTPRINT_SORTS = ["default", "recent", "earliest", "most"] as const;
export type FootprintSort = (typeof FOOTPRINT_SORTS)[number];
export const FOOTPRINT_SORT_LABELS: Record<FootprintSort, string> = {
  default: "默认（最近添加）",
  recent: "最近来过",
  earliest: "最早来过",
  most: "来得最多",
};

export function sortByFootprint<T extends { segments: FootprintSegment[]; activeOrderCount: number }>(
  rows: T[],
  sort: FootprintSort
): T[] {
  if (sort === "default") return rows;
  // segments 是倒序的：第一个真用了的是最近一次，最后一个是第一次
  const latest = (r: T) => r.segments.find((s) => !s.inactive)?.start ?? null;
  const earliest = (r: T) => [...r.segments].reverse().find((s) => !s.inactive)?.start ?? null;
  const byDate = (key: (r: T) => string | null, dir: 1 | -1) => (a: T, b: T) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return 0;
    if (x === null) return 1; // 没来过的排最后，不管正序倒序
    if (y === null) return -1;
    return x < y ? -dir : dir;
  };
  const cmp =
    sort === "recent"
      ? byDate(latest, -1)
      : sort === "earliest"
        ? byDate(earliest, 1)
        : (a: T, b: T) => b.activeOrderCount - a.activeOrderCount || byDate(latest, -1)(a, b);
  // Array.prototype.sort 是稳定的：一样的保持原来（最近添加在前）的顺序
  return [...rows].sort(cmp);
}

// 按 customer 分组，段按时间倒序（最近的在最前面，一眼看到的是最新那次）
export function buildFootprints(
  orders: FootprintOrder[]
): Map<string, CustomerFootprint> {
  const result = new Map<string, CustomerFootprint>();

  for (const order of orders) {
    const segments = orderSegments(order);
    if (segments.length === 0) continue;

    let entry = result.get(order.customer_id);
    if (!entry) {
      entry = { segments: [], seasons: [], orderCount: 0, activeOrderCount: 0, searchText: "" };
      result.set(order.customer_id, entry);
    }
    entry.segments.push(...segments);
    entry.orderCount += 1;
    const active = !INACTIVE_STATUSES.has(order.status ?? "");
    if (active) entry.activeOrderCount += 1;

    // 这一季：有一单是真用了的就不灰；这季的单全取消/未确认才灰（「那季黄过一单」也是有用信息）
    const season = segments[0].season;
    const seen = entry.seasons.find((s) => s.key === season.key);
    if (!seen) entry.seasons.push({ ...season, inactive: !active });
    else if (active) seen.inactive = false;
  }

  for (const entry of result.values()) {
    entry.segments.sort((a, b) => b.start.localeCompare(a.start));
    entry.seasons.sort((a, b) => b.start.localeCompare(a.start));
    // 年份也带上：段上只写「月/日」，不带年就搜不到「2025 年来过的」
    entry.searchText = entry.segments
      .map((s) => `${s.start.slice(0, 4)} ${s.label}`)
      .join(" ")
      .toLowerCase();
  }
  return result;
}
