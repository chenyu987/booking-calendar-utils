import { requiredItem, type ItemType } from "@/lib/locations";

// 总价这两处都是一次性算出来存进 orders.amount，不是公式字段——价格可以后面再手动改

// 排期总览拖拽改天数：按比例重算总价，单价（旧总价/旧天数）不变，乘回新天数
export function rescaleAmount(
  oldAmount: number | null,
  oldDayCount: number,
  newDayCount: number
): number | null {
  if (oldAmount == null || oldDayCount <= 0) return oldAmount;
  return Math.round((oldAmount / oldDayCount) * newDayCount * 100) / 100;
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
