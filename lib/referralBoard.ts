import { contiguousRuns, formatDayRanges } from "./dates";
import { buildDayWindow, packLanes } from "./providerBoard";
import { weekBounds } from "./revenue";
import type { RebateRow, SkipReason } from "./referral";
import { isDueBy, SKIP_LABELS } from "./referral";

// 返点的日历视图的模型层。
//
// **几何一点都不自己算** —— 日期窗口、排道、分带全部走 lib/providerBoard.ts，
// 跟排期总览 / 匹配台 / 物主那三张是同一份。这是第四张日历，也是第四个调用方，
// 不是第四份实现。
//
// 画的是**返点**不是订单：一个块 = 「某一单该给某个介绍人返多少」。
// 所以同一张单子如果将来涉及两个介绍人，会画成两个块 —— 纵轴表达的是钱，不是单。

/**
 * 返点日历自己的列宽。**比另外三张宽一倍**（PROVIDER_COL_WIDTH 是 56）——
 * 那三张的块上写的是「谁的单 · 分配进度」，这张写的是
 * 「谁的单 · 地点 / 返给谁 · 多少钱」，四段信息。56px 一天的单子全被省略号吃掉，
 * 等于块画了个寂寞。
 *
 * **唯一出处**：日历、拖拽条都从这儿取，别在组件里再写一个数。
 */
export const REFERRAL_COL_WIDTH = 112;
export const REFERRAL_COL_GAP = 2;

export const REFERRAL_BAND_DAYS_DEFAULT = 14;

export type ReferralBlock = {
  orderId: string;
  referrerId: string;
  startIndex: number;
  length: number;
  /** 谁下的单 */
  referee: string;
  /** 钱返给谁 */
  referrer: string;
  location: string;
  /** 订单状态，块的颜色跟它走 —— 跟另外三张日历同一套配色 */
  status: string;
  rebate: number;
  paid: number;
  due: number;
  counts: boolean;
  skipReason: SkipReason;
  title: string;
};

export type ReferralBoard = {
  days: string[];
  lanes: ReferralBlock[][];
  /** 画了几笔返点 */
  blockCount: number;
  /** **到本周日为止**该付的。返点是单子用完了才算数的 */
  totalDue: number;
  /** 本周日之后那些，先不计入待付 —— 单子还没发生 */
  laterDue: number;
  totalPaid: number;
};

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

export function buildReferralCalendar(input: {
  today: string;
  rows: (RebateRow & { referrerName: string })[];
  start?: string;
}): ReferralBoard {
  const { today, rows } = input;
  // 待付只算到**本周日**为止。返点是单子用完了才该给的，
  // 把下个月的单子也算进「待付」，那个数就不是「现在该打多少钱」了。
  //
  // 这个收口点不是这儿新定的：lib/revenue.ts 顶上那三个流水数字
  // （本周/本月/本季）全是以本周日收口的。**同一把尺**，两边的数才对得上。
  const dueThrough = weekBounds(today).end;

  const marks = rows.flatMap((r) => r.days);
  const days = buildDayWindow(today, marks, input.start);
  const indexOf = new Map(days.map((d, i) => [d, i]));

  const blocks: ReferralBlock[] = [];
  let totalDue = 0;
  let laterDue = 0;
  let totalPaid = 0;

  for (const r of rows) {
    const due = Math.max(0, Math.round((r.rebate - r.paid) * 100) / 100);
    // 收口的判断走 isDueBy（唯一出处，顶上的统计也调它）
    if (isDueBy(r, dueThrough)) totalDue += due;
    else laterDue += due;
    totalPaid += r.paid;

    // 不连续的需求日（只用 24、25、27）拆成几段画，跟另外三张一样
    for (const run of contiguousRuns(r.days)) {
      const visible = run.filter((d) => indexOf.has(d));
      if (visible.length === 0) continue;
      blocks.push({
        orderId: r.orderId,
        referrerId: r.referrerId,
        startIndex: indexOf.get(visible[0])!,
        length: visible.length,
        referee: r.refereeName,
        referrer: r.referrerName,
        location: r.location || "没填地点",
        status: r.orderStatus || "created",
        rebate: r.rebate,
        paid: r.paid,
        due,
        counts: r.counts,
        skipReason: r.skipReason,
        title: [
          formatDayRanges(r.days),
          `${r.days.length}天`,
          `${r.refereeName} 的单`,
          r.location || "没填地点",
          `返给 ${r.referrerName}`,
          r.counts
            ? `该返 ${money(r.rebate)}`
            : `不产生返点（${SKIP_LABELS[r.skipReason ?? "status"]}）`,
          r.paid > 0 ? `已付 ${money(r.paid)}` : due > 0 ? `待付 ${money(due)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return {
    days,
    lanes: packLanes(blocks),
    blockCount: blocks.length,
    totalDue: Math.round(totalDue * 100) / 100,
    laterDue: Math.round(laterDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
  };
}
