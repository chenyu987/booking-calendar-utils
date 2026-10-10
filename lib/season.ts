// 季：排期总览按它读数据（一次只读一季，不再每次把历年的单子全拉下来）。
//
// **一年切成两季，首尾相接、不留缝**：
//   A 区 10/1 ~ 次年 5/31（key 「25-26-na」）
//   B 区 6/1 ~ 9/30（key 「24-25-au」—— 2025 年冬天那季，跟往年 Sheet 的叫法一致）
// 不留缝是故意的：任何一天都落在某一季里，「今天是哪季」永远有答案，
// 十月里提前下的单也有地方放（算进即将开始的A 区季）。
//
// 一单算哪季：只要有一天落在季里就算（排期总览按「日子有重叠」读）。
// 跨季的单两边都看得见 —— 宁可多显示，不能让一单哪边都找不到。
// 钱归哪季是另一回事，走 revenue.ts 那套「按最早那天整单算」。

import { dateRangeToArray } from "./dates";

export type SeasonRegion = "na" | "au";

export type Season = {
  /** URL 上用的：25-26-na */
  key: string;
  region: SeasonRegion;
  /** A 区季开始那年；B 区季沿用往年 Sheet 的叫法，2025 年冬天那季是 2024 */
  startYear: number;
  /** 界面上显示的：25-26 A 区 */
  label: string;
  start: string;
  end: string;
};

const REGION_LABEL: Record<SeasonRegion, string> = { na: "A 区", au: "B 区" };
const yy = (y: number) => String(y % 100).padStart(2, "0");

export function seasonFor(region: SeasonRegion, startYear: number): Season {
  const label = `${yy(startYear)}-${yy(startYear + 1)} ${REGION_LABEL[region]}`;
  const key = `${yy(startYear)}-${yy(startYear + 1)}-${region}`;
  return region === "na"
    ? { key, region, startYear, label, start: `${startYear}-10-01`, end: `${startYear + 1}-05-31` }
    : { key, region, startYear, label, start: `${startYear + 1}-06-01`, end: `${startYear + 1}-09-30` };
}

/** 这一天落在哪一季 */
export function seasonOf(day: string): Season {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (month >= 10) return seasonFor("na", year);
  if (month <= 5) return seasonFor("na", year - 1);
  return seasonFor("au", year - 1);
}

/** 紧接着的下一季：A 区 → 同年的B 区 → 下一年的A 区 */
export function nextSeason(s: Season): Season {
  return s.region === "na" ? seasonFor("au", s.startYear) : seasonFor("na", s.startYear + 1);
}

/**
 * URL 上的 season 参数 → 季。认不出来返回 null（调用方退回「今天这季」）。
 * 两位年份按 20xx 算，这个项目活不到 2100 年
 */
export function parseSeasonKey(key: string | undefined | null): Season | null {
  const m = /^(\d{2})-(\d{2})-(na|au)$/.exec(key ?? "");
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // 「25-27」这种不是一季
  if ((a + 1) % 100 !== b) return null;
  return seasonFor(m[3] as SeasonRegion, 2000 + a);
}

/** 从 from 到 to（含两头）的每一季，**新的在前** —— 下拉里最常选的是最近的 */
export function seasonsBetween(from: Season, to: Season): Season[] {
  if (from.start > to.start) return [to];
  const out: Season[] = [];
  // 上限兜底：数据再乱也不会转出几百项
  for (let s = from; out.length < 200; s = nextSeason(s)) {
    out.push(s);
    if (s.key === to.key) break;
  }
  return out.reverse();
}

/** 这一季的每一天 —— 查库时按「日子有重叠」筛订单要用整张日子表 */
export function seasonDays(s: Season): string[] {
  return dateRangeToArray(s.start, s.end);
}

export function inSeason(day: string, s: Season): boolean {
  return day >= s.start && day <= s.end;
}
