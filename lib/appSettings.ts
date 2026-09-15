import { supabase } from "@/lib/supabase";
import { isIsoDate } from "@/lib/timelineStart";
import { clampBandDays, DEFAULT_BAND_DAYS } from "@/lib/bandDays";

// 后台设置项的读写。库里是一张 key/value 表，这里包一层，
// 让调用方拿到的是「已经验过的值」而不是裸字符串。
//
// **放跨设备该一致的东西。** 缩放、资源面板收起没收起、右边那一栏拖多宽，
// 这些还是「这台机器上我习惯怎么看」，继续留 cookie。
//
// 「每行几天」曾经也在 cookie 里，后来搬进来了 —— 因为设置页也要能改它。
// 一个值两个地方存，就是 CLAUDE.md 里栽过四次的那个模式（改了一处忘了另一处，
// 到用的时候对不上），所以搬就搬彻底：拖拽也写库，cookie 那份删掉。
// 代价是换台屏幕宽度差很多的机器时得重新拖一次，认了。

export const SETTING_KEYS = {
  /** 排期总览的日历从哪天开始显示 */
  overviewStart: "overview_start",
  /** 排期总览每行排几天 */
  overviewBandDays: "overview_band_days",
  /** 匹配台日历从哪天开始 */
  matchesStart: "matches_start",
  /** 匹配台日历每行排几天 */
  matchesBandDays: "matches_band_days",
} as const;

async function readSetting(key: string): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(key: string, value: string | null) {
  if (value === null) {
    const { error } = await supabase.from("app_settings").delete().eq("key", key);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/**
 * 排期总览的起始日期。没设、或者库里存了个不合法的日子，都当没设 ——
 * 日历那边会退回默认起点。**不合法就放过去的话，new Date 会把 2026-02-31
 * 悄悄滚到 3 月**，日历莫名其妙从别处开始，还看不出是哪儿来的。
 */
export async function getOverviewStart(): Promise<string | null> {
  const raw = await readSetting(SETTING_KEYS.overviewStart);
  return isIsoDate(raw ?? undefined) ? raw : null;
}

/** 传 null 或者不合法的日子都当成「清掉这条设置」 */
export async function setOverviewStart(value: string | null) {
  await writeSetting(
    SETTING_KEYS.overviewStart,
    isIsoDate(value ?? undefined) ? value : null
  );
}

/**
 * 排期总览每行排几天。没设、或者库里是个不合法的数，都退回默认的四周一行（不是上限） ——
 * clampBandDays 会把 NaN 也接住，不会算出「一行 0 天」把渲染卡死。
 */
export async function getOverviewBandDays(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.overviewBandDays);
  return raw === null ? DEFAULT_BAND_DAYS : clampBandDays(Number(raw));
}

export async function setOverviewBandDays(value: number) {
  await writeSetting(SETTING_KEYS.overviewBandDays, String(clampBandDays(value)));
}

// 匹配台那张日历的两条设置。
//
// **跟排期总览各存各的，不共用。** 一开始图省事让两边读同一条，结果是：在匹配台
// 调一下每行天数，排期总览跟着变 —— 那是两张不同的表、不同的用法，凭什么互相牵连。
// key/value 表里多两行的成本，比「改这儿那儿也动」的意外低得多。
export async function getMatchesStart(): Promise<string | null> {
  const raw = await readSetting(SETTING_KEYS.matchesStart);
  return isIsoDate(raw ?? undefined) ? raw : null;
}

export async function setMatchesStart(value: string | null) {
  await writeSetting(
    SETTING_KEYS.matchesStart,
    isIsoDate(value ?? undefined) ? value : null
  );
}

export async function getMatchesBandDays(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.matchesBandDays);
  return raw === null ? DEFAULT_BAND_DAYS : clampBandDays(Number(raw));
}

export async function setMatchesBandDays(value: number) {
  await writeSetting(SETTING_KEYS.matchesBandDays, String(clampBandDays(value)));
}
