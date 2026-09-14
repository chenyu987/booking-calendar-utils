import { assignBlockReason } from "./assignable";
import { computeNeed, formatGap } from "./assignment";
import { contiguousRuns, formatDayRanges } from "./dates";
import { formatParty } from "./party";

/**
 * 物主那张「我的资源 × 日期」日历的模型层。React 一行都没有，方便单测。
 *
 * **这不是 admin 排期总览的复用。** 两张日历看起来像，喂的数据完全不同：
 * admin 那张纵轴是全部资源、块上写着客户姓名和金额；物主这张纵轴**只有他自己的资源**，
 * 块上一个字的客户信息都没有。物主看不到客户是谁，跟客户看不到持有人是谁对称 ——
 * 直接把 admin 那张搬过来就把这条作废了，所以是另写一层，不是加个 readonly 开关。
 *
 * 列宽也是另一个数：admin 的 COL_WIDTH=180 是为了在块里塞下姓名·地点·状态·备注·金额，
 * 物主这边块上只有地点和缺口，180 全是空的。这不是「第二份同一个数」，是两个数。
 */
export const PROVIDER_COL_WIDTH = 56;
export const PROVIDER_COL_GAP = 2;
/** 窗口最多铺这么多天 —— 再长横着滚不完，也没人排那么远 */
export const PROVIDER_MAX_DAYS = 120;
/** 今天往前留几天：最近排出去的活儿还看得见，有个上下文 */
const LOOKBACK_DAYS = 3;

export type ProviderBlock = {
  orderId: string;
  startIndex: number;
  length: number;
  label: string;
  title: string;
  /** 已经提过意向了，再点没意义 */
  proposed: boolean;
};

export type ProviderRow = {
  resourceId: string;
  /** 已经排出去的（我自己的排期），不可点 */
  booked: ProviderBlock[];
  /** 我这个资源能接的需求，按不重叠打包成几条 */
  lanes: ProviderBlock[][];
};

/** 日历下面那条清单的一项：一个资源 × 一单，不按连续段拆 */
export type ProviderCandidate = {
  orderId: string;
  resourceId: string;
  /** 排序和显示都用它 —— 这一单最早的那天 */
  firstDay: string;
  label: string;
  title: string;
  proposed: boolean;
};

export type ProviderBoard = {
  days: string[];
  rows: ProviderRow[];
  /**
   * 跟日历上画的是同一批候选，只是摊平成一条清单。
   *
   * 为什么两份都要：日历回答「我的资源什么时候空着」，清单回答「现在有哪些能接」。
   * 手机上一屏只看得到五六天，光有日历的话，一个月后那单得横着滚半天才够得到 ——
   * 物主大概率就是在手机上看的。**不是第二份数据**：两边都从 rows 这一份算出来。
   */
  candidates: ProviderCandidate[];
  /** 有多少单是「有资源能接」的（去重），用来写一句概览 */
  candidateOrderCount: number;
};

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * 日历铺哪几天。
 *
 * 起点是「今天往前 3 天」和「最早要显示的那天」里靠后的那个 —— 往前留一点上下文，
 * 但不会因为库里有一张去年的排期就把日历拉出去半年。终点跟着最晚那天走，封顶 120 天。
 */
export function buildDayWindow(today: string, marks: string[]): string[] {
  const sorted = [...new Set(marks)].sort();
  if (sorted.length === 0) return [];
  const lookback = shiftDay(today, -LOOKBACK_DAYS);
  const start = sorted[0] > lookback ? sorted[0] : lookback;
  const last = sorted[sorted.length - 1];
  const days: string[] = [];
  for (let d = start; d <= last && days.length < PROVIDER_MAX_DAYS; d = shiftDay(d, 1)) {
    days.push(d);
  }
  return days;
}

/**
 * 贪心打包：重叠的块分到不同的条上，不重叠的挤在同一条。
 * 按开始时间排，每个块放进第一条放得下的。
 *
 * 为什么需要：同一个周末常常有好几单都落在这个资源的空档里，画在一条上会叠成一团。
 */
export function packLanes<T extends { startIndex: number; length: number }>(
  blocks: T[]
): T[][] {
  const sorted = [...blocks].sort(
    (a, b) => a.startIndex - b.startIndex || a.length - b.length
  );
  const lanes: T[][] = [];
  const laneEnd: number[] = []; // 每条已经占到哪个下标（不含）
  for (const b of sorted) {
    let i = lanes.findIndex((_, n) => laneEnd[n] <= b.startIndex);
    if (i === -1) {
      i = lanes.length;
      lanes.push([]);
      laneEnd.push(0);
    }
    lanes[i].push(b);
    laneEnd[i] = b.startIndex + b.length;
  }
  return lanes;
}

type Resource = {
  id: string;
  status?: string | null;
  holder_name?: string | null;
  holder_gender?: string | null;
  item_type?: string | null;
  date_range_start?: string | null;
  date_range_end?: string | null;
};

type Order = {
  id: string;
  location?: string | null;
  demand_days?: string[] | null;
  male_count?: number | null;
  female_count?: number | null;
};

/**
 * 把一堆日子切成连续段，再换算成日历上的块。
 * 不连续的需求（只用 24、25、27）会画成分开的两截，跟 admin 那张一个道理。
 */
function runsToBlocks(
  days: string[],
  indexOf: Map<string, number>,
  make: (run: string[], startIndex: number) => Omit<ProviderBlock, "startIndex" | "length">
): ProviderBlock[] {
  const blocks: ProviderBlock[] = [];
  for (const run of contiguousRuns(days)) {
    // 窗口封了顶，落在窗口外的段整段跳过
    const visible = run.filter((d) => indexOf.has(d));
    if (visible.length === 0) continue;
    const startIndex = indexOf.get(visible[0])!;
    blocks.push({
      ...make(visible, startIndex),
      startIndex,
      length: visible.length,
    });
  }
  return blocks;
}

export function buildProviderBoard(input: {
  today: string;
  resources: Resource[];
  orders: Order[];
  /** orderId -> 这一单已经配上的资源（判断还差男资源还是女资源） */
  assignedByOrder: Map<string, { id?: string; holder_gender?: string | null }[]>;
  /** resourceId -> 这个资源已经被占掉的日子 */
  bookedByResource: Map<string, string[]>;
  /** 已经提过意向的 `${orderId}:${resourceId}` */
  proposed: Set<string>;
}): ProviderBoard {
  const { today, resources, orders, assignedByOrder, bookedByResource, proposed } = input;

  // 先算出每个资源能接哪些单 —— 用的是分配那一份校验（lib/assignable.ts），
  // 界面上列出来的和管理员真去配的时候放行的，必须是同一套判断，
  // 否则物主提了一堆管理员根本配不上的意向
  //
  // 整单都在今天之前的先扔掉：物主再也接不了了，列出来只会占地方。
  // （管理员那边照样看得见 —— 补录历史单是他的活儿，不是物主的。）
  const actionable = orders.filter((o) => {
    const days = o.demand_days ?? [];
    return days.length > 0 && days.some((d) => d >= today);
  });

  const fits = new Map<string, Order[]>();
  for (const s of resources) {
    const booked = bookedByResource.get(s.id) ?? [];
    fits.set(
      s.id,
      actionable.filter(
        (o) =>
          (o.demand_days ?? []).length > 0 &&
          assignBlockReason({
            order: o,
            resource: s,
            alreadyAssigned: assignedByOrder.get(o.id) ?? [],
            resourceBookedDays: booked,
          }) === null
      )
    );
  }

  const marks = [
    ...resources.flatMap((s) => bookedByResource.get(s.id) ?? []),
    ...resources.flatMap((s) => (fits.get(s.id) ?? []).flatMap((o) => o.demand_days ?? [])),
  ];
  const days = buildDayWindow(today, marks);
  const indexOf = new Map(days.map((d, i) => [d, i]));

  const rows: ProviderRow[] = resources.map((s) => {
    const booked = runsToBlocks(bookedByResource.get(s.id) ?? [], indexOf, (run) => ({
      orderId: "",
      label: "已排",
      title: `已排 ${formatDayRanges(run)}（${run.length}天）`,
      proposed: false,
    }));

    const candidates = (fits.get(s.id) ?? []).flatMap((o) => {
      const need = computeNeed(o, assignedByOrder.get(o.id) ?? []);
      const gap = formatGap(need);
      const isProposed = proposed.has(`${o.id}:${s.id}`);
      return runsToBlocks(o.demand_days ?? [], indexOf, (run) => ({
        orderId: o.id,
        label: [o.location || "未填地点", gap].join(" · "),
        // 刻意没有客户姓名，也没有金额 —— 金额是客户付给平台的总价，不是物主拿的钱
        title: [
          formatDayRanges(o.demand_days ?? []),
          `${(o.demand_days ?? []).length}天`,
          o.location || "没填地点",
          formatParty(o.male_count, o.female_count),
          gap,
          isProposed ? "你已经提过意向了" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        proposed: isProposed,
      }));
    });

    return { resourceId: s.id, booked, lanes: packLanes(candidates) };
  });

  // 摊平成清单：一单被切成几段的（只用 24、25、27）在日历上是几个块，
  // 这里只算一条 —— 清单是「有哪些单能接」，不是「画了几个块」
  const candidates: ProviderCandidate[] = [];
  for (const row of rows) {
    const seen = new Set<string>();
    for (const b of row.lanes.flat()) {
      if (seen.has(b.orderId)) continue;
      seen.add(b.orderId);
      candidates.push({
        orderId: b.orderId,
        resourceId: row.resourceId,
        firstDay: days[b.startIndex],
        label: b.label,
        title: b.title,
        proposed: b.proposed,
      });
    }
  }
  candidates.sort((a, b) => (a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : 0));

  const candidateOrderCount = new Set(candidates.map((c) => c.orderId)).size;

  return { days, rows, candidates, candidateOrderCount };
}
