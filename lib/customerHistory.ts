// 排期总览：鼠标停在色块的客人名字上，浮出这个人的「老底」——
// 以前（和以后）还有哪几单、哪几天在哪个地点、当时配的是哪个持有人的资源（只要持有人，不写物主）。
//
// 全部现算，不存字段：数据源就是 orders + order_assignments + resources，跟 Customer 管理的足迹
// （lib/footprint.ts）同一个口径 —— 段怎么切、季怎么分都调它，不再写一份。
// 排期总览一次只读一季（CLAUDE.md「目录」），所以这份是悬停时单独去拿的（customer-history 路由），
// 不往整季那批数据里塞：一千八百单每单带一份历史，绝大多数永远没人看。
import { orderSegments, type SeasonTag } from "./footprint";
import { formatParty } from "./party";
import { STATUS_LABELS } from "./orderStatus";

export type HistoryOrderRow = {
  id: string;
  demand_days: string[] | null;
  location: string | null;
  status: string | null;
  male_count: number | null;
  female_count: number | null;
  order_assignments?: { resource_id: string }[] | null;
};

export type HistoryResourceRow = {
  id: string;
  holder_name: string | null;
  holder_gender: string | null;
};

export type HistoryCard = {
  /** 持有人（核验时那个名字） */
  holder: string;
  gender: "male" | "female" | null;
};

export type HistoryEntry = {
  orderId: string;
  /** 「12/24~12/26 akaad」；日期不连续的一单是几段用「、」连 */
  label: string;
  /** 排序 / 判断先后用：这一单的第一天 */
  start: string;
  party: string;
  statusLabel: string;
  /** 取消 / 未确认：浮层里灰掉（「黄过一单」本身是有用信息，跟足迹一样照列） */
  inactive: boolean;
  /** 在正在看的这一单之后（以后的单），浮层上单独标一下 */
  later: boolean;
  cards: HistoryCard[];
};

export type CustomerHistory = {
  /** 按季分组，新的季在前，组内最近的在前 */
  seasons: { season: SeasonTag; entries: HistoryEntry[] }[];
  /** 正在看的这一单之前真用了的单数（不算取消/未确认）—— 「老客户」看的是这个 */
  pastActive: number;
  /** 除了这一单以外的全部单数 */
  total: number;
};

/**
 * @param orders   这个客人的全部订单（不分季）
 * @param resources 这些订单配过的资源（软删除的也要：那是历史事实）
 * @param currentOrderId 正在看的这一单：自己不列
 */
export function buildCustomerHistory(
  orders: HistoryOrderRow[],
  resources: HistoryResourceRow[],
  currentOrderId: string | null
): CustomerHistory {
  const resourceById = new Map(resources.map((s) => [s.id, s]));
  const current = orders.find((o) => o.id === currentOrderId);
  const currentStart = current ? [...(current.demand_days ?? [])].sort()[0] ?? null : null;

  const entries: (HistoryEntry & { season: SeasonTag })[] = [];
  for (const o of orders) {
    if (o.id === currentOrderId) continue;
    // 地点名不交给它：一单几段只在最后写一次地点，段上只要日子
    const segs = orderSegments({ customer_id: "", demand_days: o.demand_days, location: null, status: o.status });
    if (segs.length === 0) continue;
    const location = (o.location ?? "").trim();
    const ranges = segs.map((s) => s.label);
    const start = segs[0].start;
    const cards: HistoryCard[] = (o.order_assignments ?? [])
      .map((a) => resourceById.get(a.resource_id))
      .filter((s): s is HistoryResourceRow => Boolean(s))
      .map((s) => ({
        holder: (s.holder_name ?? "").trim() || "?",
        gender: s.holder_gender === "male" || s.holder_gender === "female" ? s.holder_gender : null,
      }));
    entries.push({
      orderId: o.id,
      label: [ranges.join("、"), location].filter(Boolean).join(" "),
      start,
      party: formatParty(o.male_count, o.female_count),
      statusLabel: STATUS_LABELS[o.status ?? ""] ?? o.status ?? "",
      inactive: segs[0].inactive,
      later: currentStart !== null && start > currentStart,
      cards,
      season: segs[0].season,
    });
  }

  entries.sort((a, b) => b.start.localeCompare(a.start));
  const groups = new Map<string, { season: SeasonTag; entries: HistoryEntry[] }>();
  for (const { season, ...e } of entries) {
    const g = groups.get(season.key);
    if (g) g.entries.push(e);
    else groups.set(season.key, { season, entries: [e] });
  }
  return {
    seasons: [...groups.values()].sort((a, b) => b.season.start.localeCompare(a.season.start)),
    pastActive: entries.filter((e) => !e.later && !e.inactive).length,
    total: entries.length,
  };
}
