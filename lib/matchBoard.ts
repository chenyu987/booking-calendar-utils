import { assignBlockReason } from "./assignable";
import { computeNeed, formatNeed } from "./assignment";
import { contiguousRuns, formatDayRanges } from "./dates";
import { isStaleMatch } from "./matchStatus";
import { buildDayWindow, packLanes } from "./providerBoard";
import { displayName, formatPerson, type Nameable } from "./person";
import { formatValidity } from "./resourceStatus";

// 匹配台的日历视图：**照搬排期总览那张** —— 一张日历，色块是订单，横轴日期，
// 互不冲突的单子挤在同一条道上。
//
// 跟排期总览的区别只有一个：总览里点一个单子，左边列的是**全部**资源让你挑；
// 这儿点一个单子，列的是**已经有人主动说想接**的那几张。挑完就落成分配。
//
// 几何（窗口、排道、分带）全部复用 lib/providerBoard.ts —— 三张日历
// （物主那张、这张、以后可能还有）横轴怎么切、块怎么摞是同一套。

export type OrderBlock = {
  orderId: string;
  startIndex: number;
  length: number;
  /** 块是两行的，所以分开给 —— 拼成一个 label 的话渲染那边还得拆回去 */
  customer: string;
  location: string;
  need: string;
  title: string;
  status: string;
  /** 这一单有几个物主想接 */
  candidates: number;
  /** 其中现在就能拍板的有几个 */
  actionable: number;
};

export type MatchBoard = {
  days: string[];
  /** 互不冲突的单子挤在同一条道上，跟排期总览一个路子 */
  lanes: OrderBlock[][];
  orderCount: number;
  actionableCount: number;
};

/** 点开一个单子之后列出来的候选 */
export type Candidate = {
  matchId: string;
  status: string;
  holderName: string;
  holderLine: string;
  providerLine: string;
  chosen: boolean;
  stale: boolean;
  /** 配不上的原因。null = 配得上，能选 */
  blocked: string | null;
};

type Resource = {
  id: string;
  status?: string | null;
  deleted_at?: string | null;
  holder_name?: string | null;
  holder_gender?: string | null;
  holder_date_of_birth?: string | null;
  item_type?: string | null;
  // 有效期（datemultirange 文本），读法见 lib/validity.ts
  validity?: unknown;
  providers?: Nameable;
};

type MatchRow = {
  id: string;
  status: string;
  order_id: string;
  resource_id: string;
  resources?: Resource | null;
  orders?: Order | null;
};

type Order = {
  location?: string | null;
  demand_days?: string[] | null;
  male_count?: number | null;
  female_count?: number | null;
  status?: string | null;
  customers?: Nameable;
};

/**
 * 一条意向现在能不能拍板。**走分配那同一份校验** —— 点下去才报错太晚了，
 * 而这张日历的全部意义就是「哪条现在能拍板」。
 */
export function candidateOf(
  m: MatchRow,
  today: string,
  assignedByOrder: Map<string, { id?: string; holder_gender?: string | null }[]>,
  bookedByResource: Map<string, string[]>
): Candidate {
  const s: Resource = m.resources ?? ({} as Resource);
  const o: Order = m.orders ?? ({} as Order);
  const demand = o.demand_days ?? [];
  const chosen = m.status === "chosen";
  const stale = isStaleMatch(m.status, [...demand].sort()[0] ?? "", today);
  const blocked = chosen
    ? null
    : assignBlockReason({
        order: o,
        resource: { ...s, id: m.resource_id },
        alreadyAssigned: assignedByOrder.get(m.order_id) ?? [],
        resourceBookedDays: bookedByResource.get(m.resource_id) ?? [],
      });
  return {
    matchId: m.id,
    status: m.status,
    holderName: s.holder_name ?? "?",
    // 有效期显示走唯一出处，别自己拼 —— 留空要显示「不限」，规则在那儿
    holderLine: `${s.item_type ?? "-"} ${formatValidity(s)}`,
    providerLine: formatPerson(s.providers),
    chosen,
    stale,
    blocked,
  };
}

function runsToBlocks(
  days: string[],
  indexOf: Map<string, number>,
  make: () => Omit<OrderBlock, "startIndex" | "length">
): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (const run of contiguousRuns(days)) {
    const visible = run.filter((d) => indexOf.has(d));
    if (visible.length === 0) continue;
    out.push({
      ...make(),
      startIndex: indexOf.get(visible[0])!,
      length: visible.length,
    });
  }
  return out;
}

export function buildMatchBoard(input: {
  today: string;
  /** 只画**有人提过意向**的单子 —— 没人要接的去排期总览看 */
  matchesByOrder: Map<string, MatchRow[]>;
  assignedByOrder: Map<string, { id?: string; holder_gender?: string | null }[]>;
  bookedByResource: Map<string, string[]>;
  start?: string;
}): MatchBoard {
  const { today, matchesByOrder, assignedByOrder, bookedByResource } = input;

  const entries = [...matchesByOrder.entries()];
  const marks = entries.flatMap(([, ms]) => ms[0]?.orders?.demand_days ?? []);
  const days = buildDayWindow(today, marks, input.start);
  const indexOf = new Map(days.map((d, i) => [d, i]));

  let actionableCount = 0;
  const blocks: OrderBlock[] = [];

  for (const [orderId, ms] of entries) {
    const o = ms[0]?.orders ?? {};
    const demand = o.demand_days ?? [];
    const cands = ms.map((m) => candidateOf(m, today, assignedByOrder, bookedByResource));
    const actionable = cands.filter((c) => !c.chosen && !c.stale && !c.blocked).length;
    actionableCount += actionable;

    // 色块上只写名字（昵称），不带账号 —— 一天的块就那么宽
    const who = displayName(o.customers, "-");
    const need = computeNeed(o, assignedByOrder.get(orderId) ?? []);
    blocks.push(
      ...runsToBlocks(demand, indexOf, () => ({
        orderId,
        customer: who,
        location: o.location || "没填地点",
        need: formatNeed(need),
        title: [
          formatDayRanges(demand),
          `${demand.length}天`,
          who,
          o.location || "没填地点",
          formatNeed(need),
          `${ms.length} 个物主想接`,
          actionable > 0 ? `${actionable} 个现在能选` : "现在一个也选不了",
        ].join(" · "),
        status: o.status ?? "created",
        candidates: ms.length,
        actionable,
      }))
    );
  }

  return { days, lanes: packLanes(blocks), orderCount: entries.length, actionableCount };
}
