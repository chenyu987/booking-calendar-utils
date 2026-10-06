// Customer 足迹：这个人以前哪几天在哪个地点用过。
//
// 全部现算，不存字段 —— 数据源就是 orders 的 demand_days + location，
// 存一份「足迹」到 customers 上，改单的时候必然忘同步（这项目栽过四次的那个坑）。
import { contiguousRuns, shortLabel } from "./dates";

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
};

export type CustomerFootprint = {
  segments: FootprintSegment[];
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
    };
  });
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
      entry = { segments: [], orderCount: 0, activeOrderCount: 0, searchText: "" };
      result.set(order.customer_id, entry);
    }
    entry.segments.push(...segments);
    entry.orderCount += 1;
    if (!INACTIVE_STATUSES.has(order.status ?? "")) entry.activeOrderCount += 1;
  }

  for (const entry of result.values()) {
    entry.segments.sort((a, b) => b.start.localeCompare(a.start));
    entry.searchText = entry.segments
      .map((s) => s.label)
      .join(" ")
      .toLowerCase();
  }
  return result;
}
