// 匹配台那张表怎么排。
//
// **默认按活动日期从近到远**，不是按提交时间。匹配台是个待办队列，最该先处理的
// 是「下周就要用资源」的那一单，不是「刚提上来」的那一条 —— 提交时间只说明谁手快。
// 想看最新提上来的还是能切。
//
// 日期排序只能在内存里做：demand_days 是个数组，「这一单最早哪天」在 SQL 里
// 表达不了（真要写就得把排序逻辑写第二遍在 SQL 里，正是本项目栽过四次的模式）。
// 一季 150–250 单，匹配意向更少，不心疼。

export const MATCH_SORTS = {
  date: "日期 近 → 远",
  dateDesc: "日期 远 → 近",
  created: "最近提交的",
} as const;

export type MatchSort = keyof typeof MATCH_SORTS;

export function parseMatchSort(value: string | undefined): MatchSort {
  return value === "dateDesc" || value === "created" ? value : "date";
}

/** 这一单最早那天。没有日期的返回空串 */
export function firstDay(row: { orders?: { demand_days?: string[] | null } | null }): string {
  const days = row.orders?.demand_days ?? [];
  if (days.length === 0) return "";
  return [...days].sort()[0];
}

export function sortMatches<
  T extends { created_at?: string | null; orders?: { demand_days?: string[] | null } | null },
>(rows: T[], sort: MatchSort): T[] {
  const out = [...rows];
  if (sort === "created") {
    out.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return out;
  }
  out.sort((a, b) => {
    const x = firstDay(a);
    const y = firstDay(b);
    // 没填日期的一律沉底，不管正序倒序 —— 它们排在哪儿都不对，
    // 但夹在中间最碍事（看着像日期最早或最晚的那一批）
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return sort === "dateDesc" ? y.localeCompare(x) : x.localeCompare(y);
  });
  return out;
}
