// 日历右边那道帘子：拖出来的宽度既是「对外链接」那一栏的宽度，
// 也决定日历每行排几天。往左拖 → 帘子变宽 → 每行少几天，
// 排不下的日子挤到下一行（不是被藏起来，也不是横着滚出去）。
//
// **精确到天，不是到周。** 一行可以到周三结束、下一行从周四开始；
// 跨着这条缝的单子在上下两行各画一截（渲染那边本来就是按段切的）。
//
// 每行的天数不是拖出来的一个独立数字，而是**量出来的**：日历那块地
// 还剩多宽，就排得下几列。所以帘子右边是一条硬边界 —— 排下的正好铺满，
// 排不下的换行，不会有横向滚动条把日子藏到右边去。

/**
 * 一列一天的宽度 —— **唯一出处**，page.tsx 从这儿 import，别再各写一份。
 * （原来两边各写了个 150，注释里还写着「跟 page.tsx 对齐」靠人记着对齐，
 *   正是本项目栽过四次的那个模式。）
 *
 * 150 → 180：订单色块从三行压成两行之后，横着要放的东西变多了
 * （第一行：姓名·地点 · 状态 · 备注 · 金额）。一天的单子在 150 下已经挤到
 * 没法看，加宽 30px 换来的是每行都放得开。代价是一屏少看两天，
 * 但每行几天本来就是可调的（设置里，或者拖右边那道帘子）。
 */
export const COL_WIDTH = 180;
export const COL_GAP = 2;

/** 再窄也得看得见几天，不然一行一天就没法看跨天的单子了 */
/** 帘子整条占的宽度：卡片 230 + 手柄 5 + 间距 10。量「日历还剩多宽」时要扣掉 */
export const RAIL_TOTAL_WIDTH = 245;
/** 竖向滚动条的宽度。日历那一格留出这么多，不然竖条一出来就挤出一根横条 */
export const SCROLLBAR_ALLOWANCE = 16;

export const MIN_BAND_DAYS = 3;
/** 四周一行 —— 没设过、量不到、双击「放回去」，都回到这个数 */
export const DEFAULT_BAND_DAYS = 28;
/** 上限八周。默认跟上限是两回事：默认是「进来先看到什么」，上限只是「最多能拖到哪」 */
export const MAX_BAND_DAYS = 56;

export function clampBandDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_BAND_DAYS;
  return Math.min(MAX_BAND_DAYS, Math.max(MIN_BAND_DAYS, Math.floor(days)));
}

/** n 列铺开来占多宽（列之间有 gap，两头没有） */
export function widthForBandDays(days: number, zoom = 1): number {
  const n = clampBandDays(days);
  return (n * COL_WIDTH + (n - 1) * COL_GAP) * zoom;
}

/**
 * 量出来的可用宽度 → 每行排几天。
 * 只数**整列**：半列宽的空隙宁可空着，也不能让最后一天被切一半。
 */
export function bandDaysForWidth(availableCssPx: number, zoom = 1): number {
  if (!Number.isFinite(availableCssPx) || availableCssPx <= 0 || zoom <= 0) {
    // 量出来是 0 说明这块地这会儿根本没渲染（页面在后台标签页、被 display:none
    // 盖着）。这时候**不能**当成「只放得下 3 天」，那会把布局压扁并存下来。
    // 回默认而不是回上限：上限现在是八周，拿它当兜底等于一有闪失就摊成一大片
    return DEFAULT_BAND_DAYS;
  }
  const usable = availableCssPx / zoom;
  return clampBandDays(Math.floor((usable + COL_GAP) / (COL_WIDTH + COL_GAP)));
}

/**
 * 拖了多远 → 天数加减几。
 * 往左拖一列宽就少一天，往右一样。用**相对位移**不是绝对位置：四周一行时
 * 日历比屏幕宽，手柄站的是可见区右边缘而不是最后一天右边，按绝对位置算的话
 * 一按下去天数就先跳一下。
 */
export function dragDelta(deltaX: number, zoom = 1): number {
  if (!Number.isFinite(deltaX) || zoom <= 0) return 0;
  // `|| 0` 是为了把 Math.round(-0.4) 的 -0 归一成 0：-0 参与后面的比较会
  // 冒出 Object.is 那种意外
  return Math.round(deltaX / ((COL_WIDTH + COL_GAP) * zoom)) || 0;
}

/** 自动加减的触发区宽度：指针进到这块地的左右两头这么近，就开始连续变 */
export const AUTO_EDGE = 56;
/** 连续变的速度范围（天/秒）：刚进触发区慢，压到边上最快 */
const AUTO_MIN_SPEED = 3;
const AUTO_MAX_SPEED = 24;

/**
 * 指针停在哪儿 → 每秒自动加减几天（负数是减）。不在触发区就是 0。
 */
export function autoStepSpeed(
  pointerX: number,
  left: number,
  right: number,
  edge = AUTO_EDGE
): number {
  if (!Number.isFinite(pointerX) || right - left <= 0 || edge <= 0) return 0;
  const ramp = (depth: number) =>
    AUTO_MIN_SPEED + (AUTO_MAX_SPEED - AUTO_MIN_SPEED) * Math.min(1, depth / edge);
  // 压到左边：减天数。超出边界外面也算，按压满算
  if (pointerX < left + edge) return -ramp(left + edge - pointerX);
  if (pointerX > right - edge) return ramp(pointerX - (right - edge));
  return 0;
}

/** 对外链接那几个资源片的固有宽度。这一栏最宽就到这儿，再宽全是空的 */
export const RAIL_WIDTH = 230;

/**
 * 帘子那一栏拖到多宽。**不吸附**：拖到哪儿留在哪儿，半开着也是一个有效状态
 * （比如只想露出「我要租借」那一张）。0 就是完全收起来。
 */
export function clampRailWidth(px: number): number {
  if (!Number.isFinite(px)) return RAIL_WIDTH;
  return Math.min(RAIL_WIDTH, Math.max(0, Math.round(px)));
}
