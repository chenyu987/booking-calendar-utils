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
