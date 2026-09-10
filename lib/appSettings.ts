import { supabase } from "@/lib/supabase";
import { isIsoDate } from "@/lib/timelineStart";

// 后台设置项的读写。库里是一张 key/value 表，这里包一层，
// 让调用方拿到的是「已经验过的值」而不是裸字符串。
//
// **只放跨设备该一致的东西。** 缩放、资源面板收起没收起、每行排几天，那些是
// 「这台机器上我习惯怎么看」，继续留 cookie —— 搬进库等于换个屏幕就被另一台
// 的习惯覆盖掉。

export const SETTING_KEYS = {
  /** 排期总览的日历从哪天开始显示 */
  overviewStart: "overview_start",
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
