const PEAK_RANGES: { start: string; end: string }[] = [
  // 2026/27 季
  { start: "2026-11-27", end: "2026-11-28" }, // 感恩节
  { start: "2026-12-26", end: "2026-12-31" }, // 圣诞到跨年
  { start: "2027-01-16", end: "2027-01-16" }, // MLK 周末
  { start: "2027-02-13", end: "2027-02-14" }, // 总统日周末
];

// ISO 日期（YYYY-MM-DD）字符串按字典序比较就是按时间比较，不用转 Date
export function isPeakDate(isoDate: string): boolean {
  return PEAK_RANGES.some((r) => isoDate >= r.start && isoDate <= r.end);
}

// 订单横跨的日子里有几天是 peak —— 给「这单挑的日子贵不贵」用
export function countPeakDays(isoDates: string[]): number {
  return isoDates.filter(isPeakDate).length;
}
