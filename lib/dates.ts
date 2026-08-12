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

// 把一堆日期压成「9/10~9/12、9/15」这种紧凑写法
export function formatDayRanges(days: string[]): string {
  return contiguousRuns(days)
    .map((run) => {
      const first = shortLabel(run[0]).date;
      if (run.length === 1) return first;
      return `${first}~${shortLabel(run[run.length - 1]).date}`;
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
