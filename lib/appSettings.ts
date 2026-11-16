import { supabase } from "@/lib/supabase";
import { isIsoDate } from "@/lib/timelineStart";
import { DEFAULT_REFERRAL_RATE } from "@/lib/referral";
import type { DayPrices } from "@/lib/pricing";

// 后台设置项的读写。库里是一张 key/value 表，这里包一层，
// 让调用方拿到的是「已经验过的值」而不是裸字符串。
//
// **放跨设备该一致的东西。** 缩放、资源面板收起没收起、右边那一栏拖多宽，
// 这些还是「这台机器上我习惯怎么看」，继续留 cookie。
//
// 「每行几天」在这儿待过一阵（2026-10-20 搬回 cookie）：两个管理员分开用以后，
// 一个 14 一个 28，全站一份就互相改对方的。现在在 lib/bandDaysSetting.ts。

export const SETTING_KEYS = {
  /** 排期总览的日历从哪天开始显示 */
  overviewStart: "overview_start",
  /** 排期总览的日历到哪天结束 */
  overviewEnd: "overview_end",
  /** 匹配台日历从哪天开始 */
  matchesStart: "matches_start",
  /** 介绍人返点的全局默认比例 */
  referralRate: "referral_rate_default",
  /** 主要管理员（0019）：没写是谁的单子都算他的，他的单色块不上色 */
  primaryAdmin: "primary_admin_id",
  /** 每人每天的默认单价（美元）：新建单时预填（金额 = 单价 × 天数 × 人数，可改），需求页也拿它估总价。
   *  key 名沿用需求页那时起的，没改：库里已经存着值 */
  requestPriceBeta: "request_price_beta",
  requestPriceAlpha: "request_price_alpha",
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

/** 排期总览的结束日期。跟起始日期一样：没设或者不合法都当没设 */
export async function getOverviewEnd(): Promise<string | null> {
  const raw = await readSetting(SETTING_KEYS.overviewEnd);
  return isIsoDate(raw ?? undefined) ? raw : null;
}

export async function setOverviewEnd(value: string | null) {
  await writeSetting(
    SETTING_KEYS.overviewEnd,
    isIsoDate(value ?? undefined) ? value : null
  );
}

// 匹配台那张日历从哪天开始（每行几天在 lib/bandDaysSetting.ts）。
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

// 介绍人返点的**全局默认**比例。真正算返点时优先用被介绍人那一行上的快照
// （customers.referral_rate），这里只是「新建关系时填什么」和「快照留空时按什么算」。
//
// 放 app_settings 而不是写死常量：这个数会调（试运行期 10%，旺季可能改）。
// 但**改了不影响已经建好的关系** —— 那些行上有自己的快照，见 lib/referral.ts。
export async function getReferralRate(): Promise<number> {
  const raw = await readSetting(SETTING_KEYS.referralRate);
  if (raw === null) return DEFAULT_REFERRAL_RATE;
  const n = Number(raw);
  // 库里存了个不合法的值就退回默认。放过去的话整页返点会变成 NaN，
  // 而且看不出是哪儿来的 —— 跟 getOverviewStart 拦不合法日期同一个道理
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_REFERRAL_RATE;
}

export async function setReferralRate(rate: number) {
  const safe = Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : DEFAULT_REFERRAL_RATE;
  await writeSetting(SETTING_KEYS.referralRate, String(safe));
}

// 主要管理员（0019）。大多数单子都是他做的：没写是谁的单子算他的（lib/orderFrame.ts 的
// effectiveAdminId），他的单在排期总览上保持原样不上色，只有别的管理员的单带颜色。
//
// 这里只存 id、不验 —— 验要拿管理员名单，调用方手上本来就有（排期总览、设置弹框都会查 admins），
// 用 resolvePrimaryAdmin 对一下。库里存的 id 对不上任何人（被手工改坏了）就当没设
export async function getPrimaryAdminId(): Promise<string | null> {
  return readSetting(SETTING_KEYS.primaryAdmin);
}

export async function setPrimaryAdminId(id: string | null) {
  await writeSetting(SETTING_KEYS.primaryAdmin, id);
}

// —— 每人每天的默认单价（Alpha / Beta 各一个）——
//
// 两个管理员该一样，所以放库里不放 cookie。两处用（2026-11-11 起是同一对数，只有一份）：
//   - 排期总览新建单：按地点（或 Alpha / Beta 开关）预填「每天单价」，总价 = 单价 × 天数 × 人数，都能改
//     （lib/pricing.ts 的 defaultDayPrice）。只是预填，存进订单的是那一刻框里的总价，改了单价不动老单
//   - 需求页估总价、排序
// 在设置弹框里改，需求页上那一排也能改，改的是同一对。

export type RequestPrices = DayPrices;

export const REQUEST_PRICE_MAX = 10000;

/** 表单里填的单价：空 = 不设；负数、太大、不是数都当不设（不报错，估价那一列空着就看得出来） */
export function parseRequestPrice(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/^\$/, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= REQUEST_PRICE_MAX ? Math.round(n * 100) / 100 : null;
}

export async function getRequestPrices(): Promise<RequestPrices> {
  const [beta, alpha] = await Promise.all([
    readSetting(SETTING_KEYS.requestPriceBeta),
    readSetting(SETTING_KEYS.requestPriceAlpha),
  ]);
  return { beta: parseRequestPrice(beta), alpha: parseRequestPrice(alpha) };
}

export async function setRequestPrices(prices: RequestPrices) {
  await Promise.all([
    writeSetting(SETTING_KEYS.requestPriceBeta, prices.beta === null ? null : String(prices.beta)),
    writeSetting(SETTING_KEYS.requestPriceAlpha, prices.alpha === null ? null : String(prices.alpha)),
  ]);
}

