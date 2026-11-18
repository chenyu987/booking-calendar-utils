// 日历从哪天开始。
//
// 默认是「最早的单子和今天里靠前的那个」再往前留两天、退到那一周的周一 ——
// 进来就能看到最近的活儿，左边还留一点上下文。
//
// 但补录历史单、或者想直接跳到季中段的时候，这个默认就碍事了，所以可以在
// 界面上指定一个开始日期。指定了就**原样用**：不往前留两天、也不退到周一 ——
// 说从这天开始就从这天开始，不然「我明明填了 12/1 怎么显示 11/25」很莫名。

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  // 2026-02-31 这种格式对、日子不存在的，Date 会自己滚到 3 月，转回来就对不上
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * 算出时间轴的起点。
 * @param explicit 界面上指定的开始日期，没指定或格式不对就当没指定
 * @param fallback 默认起点（调用方按老规矩算好的：留两天 + 退到周一）
 */
export function resolveTimelineStart(
  explicit: string | undefined,
  fallback: string
): string {
  return isIsoDate(explicit) ? explicit : fallback;
}

/** 起点定死之后，这些单子整个落在起点之前，界面上一条都看不见 */
export function ordersBeforeStart<T extends { demand_days?: string[] | null }>(
  orders: T[],
  start: string
): T[] {
  if (!isIsoDate(start)) return [];
  // 只要有一天在起点当天或之后就还看得见，不算「被挡住」
  return orders.filter((o) => {
    const days = o.demand_days ?? [];
    return days.length > 0 && days.every((d) => d < start);
  });
}

// 日历到哪天结束。
//
// 默认是「最晚的单子和今天里靠后的那个」再往后留出一整段空白（给拖拽建新单用）。
// 指定了就**原样用**，跟起点同一个道理：说到哪天就到哪天，不补齐整段、也不再往后
// 接空白 —— 最后一行可以比别的行短，那正好看得出「日历到这儿就停了」。

/**
 * 算出时间轴的终点。
 * @param explicit 界面上指定的结束日期，没指定或格式不对就当没指定（返回 null，用默认）
 * @param start 已经定下来的起点。**终点早于起点也当没指定** —— 起点可能是默认算出来的
 *   （没在设置里填），存的时候拦不住；照原样用的话日历整个消失，连往上拖新单的地方都没有
 */
export function resolveTimelineEnd(
  explicit: string | undefined,
  start: string
): string | null {
  if (!isIsoDate(explicit)) return null;
  return explicit >= start ? explicit : null;
}
