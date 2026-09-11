// 把一个日期区间展开成逐天的 ISO 日期数组，塞进 orders.demand_days (date[])
export function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// 显示成「12/24 周三」
export function shortLabel(isoDate: string): { date: string; weekday: string } {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return {
    date: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
    weekday: `周${weekdays[d.getUTCDay()]}`,
  };
}

// 把排好序的日期切成连续的段，这样不连续的订单会显示成几条分开的条
export function contiguousRuns(days: string[]): string[][] {
  const sorted = [...new Set(days)].sort();
  const runs: string[][] = [];

  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last) {
      const prev = new Date(`${last[last.length - 1]}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() + 1);
      if (prev.toISOString().slice(0, 10) === day) {
        last.push(day);
        continue;
      }
    }
    runs.push([day]);
  }
  return runs;
}

/**
 * 把一堆日期压成「9/10-12、9/15」这种紧凑写法。
 *
 * **同一个月只写一次月份**：9/9-10，不写 9/9~9/10。这些区间要挤在很窄的地方
 * （资源清单那行「已排 …」、订单列表），省下的两三个字符换的是多看一段踪迹。
 * 跨月了才把月份写全（11/30-12/2）—— 那时候月份是真信息，省不得。
 *
 * 分隔符用「-」不用「~」：窄处「~」在小字号下跟「-」不好分，而且「-」更短。
 */
export function formatDayRanges(days: string[]): string {
  return contiguousRuns(days)
    .map((run) => {
      const first = shortLabel(run[0]).date;
      if (run.length === 1) return first;
      const last = run[run.length - 1];
      // 同月：只写后面那个「日」。比月份字符串更可靠的判断是直接比 ISO 的年月，
      // 免得 9/9 和 9/9（去年的）被当成同一个月
      const sameMonth = run[0].slice(0, 7) === last.slice(0, 7);
      const lastLabel = shortLabel(last);
      return sameMonth
        ? `${first}-${lastLabel.date.split("/")[1]}`
        : `${first}-${lastLabel.date}`;
    })
    .join("、");
}

// Admin 编辑时用逗号分隔的日期串，这样不连续的天数也能改（比如只用 24、25、27）
export function parseDaysInput(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

export function formatDaysInput(days?: string[] | null): string {
  return (days ?? []).join(", ");
}

export function dateRangeToArray(start: string, end: string): string[] {
  const days: string[] = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  for (
    let d = new Date(startDate);
    d.getTime() <= endDate.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// 排期总览拖拽改订单日期：把原来那一段连续日期从 demand_days 里摘掉，换成新的一段，
// 订单里其它不连续的日期段（比如只用 24、25、27）保持不动
export function replaceDayRun(
  existingDays: string[],
  oldRunStart: string,
  oldRunEnd: string,
  newStart: string,
  newEnd: string
): string[] {
  const oldRunDays = new Set(dateRangeToArray(oldRunStart, oldRunEnd));
  const remaining = existingDays.filter((d) => !oldRunDays.has(d));
  const newRunDays = dateRangeToArray(newStart, newEnd);
  return [...new Set([...remaining, ...newRunDays])].sort();
}

// 排期总览拖拽订单色块左右边框：根据拖动天数（delta）算出新的起止下标。
// 拖左边框改起点（不能超过终点），拖右边框改终点（不能小于起点），两头都卡在时间轴范围内。
export function resizeIndices(
  startIndex: number,
  length: number,
  timelineLength: number,
  edge: "start" | "end",
  delta: number
): { newStartIdx: number; newEndIdx: number } {
  let newStartIdx = startIndex;
  let newEndIdx = startIndex + length - 1;
  if (edge === "start") {
    newStartIdx = Math.min(Math.max(startIndex + delta, 0), newEndIdx);
  } else {
    newEndIdx = Math.max(Math.min(newEndIdx + delta, timelineLength - 1), newStartIdx);
  }
  return { newStartIdx, newEndIdx };
}
