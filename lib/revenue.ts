// 排期总览顶上那几个流水数字。
//
// 两条口径上的约定，改之前先想清楚：
//
// 1. **一单算在哪一周/哪个月**：按 demand_days 里最早那一天。跨周或跨月的单子
//    整单算进开始的那一格，不按天拆。拆的话同一单的钱会出现在两个格子里，
//    加起来对不上总数。
//
// 2. **截止到本周日**：本周/本月/本季三个数字的结束点都是本周的周日，
//    不是"今天"。这样月和季的数字里天然包含完整的本周，跟上面那个本周数字对得上。
//
// 取消和退款的单子一律不算钱（跟页面上原来那个"流水（不含取消/退款）"一致）。

export type RevenueOrder = {
  demand_days?: string[] | null;
  amount?: number | string | null;
  status?: string | null;
};

const NOT_REVENUE = new Set(["cancelled", "refunded"]);

export function countsTowardRevenue(status: string | null | undefined): boolean {
  return !NOT_REVENUE.has(status ?? "");
}

// 订单归属的那一天 = 最早的需求日。没有日期的单子返回 null，一律不计入。
export function orderStartDay(o: RevenueOrder): string | null {
  const days = o.demand_days;
  if (!days || days.length === 0) return null;
  let min = days[0];
  for (const d of days) if (d < min) min = d;
  return min;
}

function shift(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// 本周 = 周一到周日（跟日历那边每段从周一开始保持一致）
export function weekBounds(today: string): { start: string; end: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=周日
  const backToMonday = (dow + 6) % 7;
  const start = shift(today, -backToMonday);
  return { start, end: shift(start, 6) };
}

export function monthFirstDay(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

// from 传 null 表示不设起点（本季：到本周日为止的所有单子）
function inRange(day: string, from: string | null, to: string): boolean {
  if (day > to) return false;
  if (from != null && day < from) return false;
  return true;
}

// 只判断"这一单归不归这个区间"，不管状态。给"本周未配齐"这种既要按周筛、
// 又要按分配进度筛的场景用，两个条件在调用处各自写清楚。
export function startsInRange(
  o: RevenueOrder,
  from: string | null,
  to: string
): boolean {
  const day = orderStartDay(o);
  return day != null && inRange(day, from, to);
}

function pick(orders: RevenueOrder[], from: string | null, to: string): RevenueOrder[] {
  return orders.filter((o) => {
    if (!countsTowardRevenue(o.status)) return false;
    const day = orderStartDay(o);
    return day != null && inRange(day, from, to);
  });
}

export function countInRange(
  orders: RevenueOrder[],
  from: string | null,
  to: string
): number {
  return pick(orders, from, to).length;
}

export function sumInRange(
  orders: RevenueOrder[],
  from: string | null,
  to: string
): number {
  return pick(orders, from, to).reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
}
