// Customer 足迹：这个人以前哪几天在哪个地点用过。
//
// 全部现算，不存字段 —— 数据源就是 orders 的 demand_days + location，
// 存一份「足迹」到 customers 上，改单的时候必然忘同步（这项目栽过四次的那个坑）。
import { contiguousRuns, shortLabel } from "./dates";

// 取消/退款的单子照样算进足迹：「这人退过一单」本身是有用信息，
// 只是界面上灰掉，跟正常单区分开。
const INACTIVE_STATUSES = new Set(["cancelled", "refunded"]);

export type FootprintOrder = {
  customer_id: string;
  demand_days: string[] | null;
  location: string | null;
  status: string | null;
};

export type FootprintSegment = {
  // 显示用：「1/18~1/19 perisher」
  label: string;
  // 排序用的 ISO 起始日
  start: string;
  // cancelled / refunded，界面上灰掉
  inactive: boolean;
};

export type CustomerFootprint = {
  segments: FootprintSegment[];
  // 单数，不是段数 —— 一单日期不连续会拆成好几段（只用 24、25、27）
  orderCount: number;
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
      entry = { segments: [], orderCount: 0, searchText: "" };
      result.set(order.customer_id, entry);
    }
    entry.segments.push(...segments);
    entry.orderCount += 1;
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
