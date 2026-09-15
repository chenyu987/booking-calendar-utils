// 匹配台的「按单聚合」：一行一个订单，底下挂着抢它的那几个物主。
//
// 为什么值得单独一个视图：意向是**多对多**堆起来的，同一单常常有好几个物主想接。
// 平铺的话订单那几列（日期/地点/客户/人数/进度/状态）每条意向重印一遍 —— 十列里
// 有六列是逐行重复的；而「这一单有 3 个人想接、我得挑一个」这件事，反而要靠眼睛
// 自己把相邻几行认出来。
//
// **不改排序，只是把挨着的同一单收起来。** 分组的先后 = 每个订单第一次出现的先后，
// 所以外面按什么排（日期近→远、最近提交的），这里就还是什么顺序 ——
// 自己再排一次的话，切换视图顺序就变了，同一批东西看着像两批。

export type MatchGroup<T> = {
  orderId: string;
  /** 这一单的信息从第一条意向上带出来 —— 同一单的每条意向带的都是同一份 */
  first: T;
  matches: T[];
};

export function groupMatchesByOrder<T extends { order_id: string }>(
  rows: T[]
): MatchGroup<T>[] {
  const byOrder = new Map<string, MatchGroup<T>>();
  for (const row of rows) {
    const g = byOrder.get(row.order_id);
    if (g) g.matches.push(row);
    else byOrder.set(row.order_id, { orderId: row.order_id, first: row, matches: [row] });
  }
  // Map 保插入顺序 = 每个订单第一次出现的顺序 = 外面排好的顺序
  return [...byOrder.values()];
}

export type MatchView = "flat" | "order" | "calendar";

/**
 * **默认日历。** 匹配是按日期做的决定 —— 哪几天有人求物品、跟已经排出去的撞不撞，
 * 摊在一条时间轴上才看得出来；列表里只有一行一行的日期文字，得自己在脑子里排。
 * 日历上一个单子就是一个块，点开就能挑谁来接（见 lib/matchBoard.ts）。
 *
 * 另外两个留着当备选：按单聚合（`?group=order`）一行一个订单、底下挂着抢它的物主，
 * 想逐单过一遍的时候顺手；平铺（`?group=flat`）一行一个「订单 × 资源」，
 * 想一眼扫过所有意向、或者按物主找的时候更顺手。
 *
 * 所以 URL 里出现的是**非默认**的那个（`?group=order` / `?group=flat`），默认不拼参数 ——
 * 跟这一页别的开关一个路子（排序默认「近→远」也不写进 URL）。
 */
export function parseMatchView(value: string | undefined): MatchView {
  return value === "flat" || value === "order" ? value : "calendar";
}
