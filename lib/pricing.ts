import { requiredItem, type ItemType } from "@/lib/locations";

// 总价是一次性算出来存进 orders.amount 的，不是公式字段——价格可以后面再手动改。
// 但单子的天数、人数变了，总价得跟着变：所有改天数 / 人数的入口都调下面这两个
// （排期总览拖天数、色块里改人数、Order 列表的编辑），别在入口里自己乘。

/** 一单的「规模」：几天、几个人 */
export type OrderSize = { days: number; party: number };

// 按比例重算总价：每人每天的价钱（旧总价 / 旧天数 / 旧人数）不变，乘回新的天数和人数。
// 原来谈的是整单价（3 天 2 人一共 250）的也一样按比例走 —— 不对就手动改金额
export function rescaleAmount(
  oldAmount: number | null,
  from: OrderSize,
  to: OrderSize
): number | null {
  const oldUnits = from.days * from.party;
  // 旧的天数或人数是 0：单价算不出来，原样返回，不猜
  if (oldAmount == null || !(oldUnits > 0)) return oldAmount;
  return Math.round((oldAmount / oldUnits) * to.days * to.party * 100) / 100;
}

/**
 * 编辑一单之后该存的总价。
 * - 这次**手动改了金额**（typed 跟旧金额不一样）→ 以手填的为准（谈了个优惠价之类的）
 * - 没改金额（typed 不传，或者跟旧的一样）→ 按天数、人数的变化按比例重算
 */
export function amountAfterEdit(
  old: OrderSize & { amount: number | null },
  next: OrderSize,
  typed?: number | null
): number | null {
  if (typed !== undefined && typed !== old.amount) return typed;
  return rescaleAmount(old.amount, old, next);
}

// 新建单弹窗填「每天单价」时，顺手算出总价（单价 × 天数 × 人数）
export function computeTotalFromPerDay(
  perDayPrice: number,
  dayCount: number,
  partySize: number
): number {
  return Math.round(perDayPrice * dayCount * partySize * 100) / 100;
}

/** 每个类型的默认每人每天单价（设置里那两个数，存 app_settings，见 lib/appSettings.ts 的 getDayPrices） */
export type DayPrices = { beta: number | null; alpha: number | null };

/**
 * 新建单弹窗预填的「每天单价」= 每人每天的默认价。按哪个类型：
 *   - 地点名认得出是哪边的 → 按地点（填了 Locce 就是 Beta 的价，不管上面开关切在哪）
 *   - 地点还没填 / 认不出来 → 看排期总览的「Alpha / Beta」开关；开关在「全部」就不猜
 * 那个类型没设单价 → null（不预填，跟以前一样自己填）
 */
export function defaultDayPrice(
  location: string | null | undefined,
  itemMode: "" | ItemType,
  prices: DayPrices
): number | null {
  const item = requiredItem(location) ?? (itemMode || null);
  return item ? prices[item] : null;
}

/**
 * 每天单价、天数、人数都齐了才算总价；缺一样 → null（总价框留空，不拿 0 人去算出个 $0）
 */
export function autoTotal(perDay: string, dayCount: number, partySize: number): string | null {
  const rate = Number(perDay);
  if (perDay.trim() === "" || !Number.isFinite(rate) || rate < 0) return null;
  if (dayCount <= 0 || partySize <= 0) return null;
  return String(computeTotalFromPerDay(rate, dayCount, partySize));
}
