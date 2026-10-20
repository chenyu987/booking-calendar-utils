import { cookies } from "next/headers";
import { clampBandDays, DEFAULT_BAND_DAYS } from "@/lib/bandDays";
import { REFERRAL_BAND_DAYS_DEFAULT } from "@/lib/referralBoard";

// 三张日历「每行排几天」的读写。**存 cookie，每台电脑各记各的**（2026-10-20 改的）。
//
// 原来存在 app_settings 里，全站一份。两个管理员分开用以后就打架：一个习惯 14 天一行、
// 一个习惯 28，谁改一下另一个打开就变了。这是「我这台屏幕怎么看」，跟缩放、
// 面板收起、帘子拖多宽是一类东西，那些本来就在 cookie 里。
//
// 设置弹框和拖竖条改的还是**同一个值**（都走这里写同一个 cookie），没有两份。
//
// 三张表**各存各的**：在匹配台调一下天数，排期总览不该跟着变 —— 两张不同的表、不同的用法。
// cookie 名沿用原来库里的 key，看到哪个都认得出是同一件事。

export type BandDaysBoard = "overview" | "matches" | "referral";

const COOKIE: Record<BandDaysBoard, string> = {
  overview: "overview_band_days",
  matches: "matches_band_days",
  referral: "referral_band_days",
};

// 返点日历的默认是它自己的 14（列宽了一倍），另外两张是四周一行
const DEFAULT: Record<BandDaysBoard, number> = {
  overview: DEFAULT_BAND_DAYS,
  matches: DEFAULT_BAND_DAYS,
  referral: REFERRAL_BAND_DAYS_DEFAULT,
};

/**
 * 没设过、或者 cookie 被改成了脏值，都退回默认 —— clampBandDays 把 NaN 也接住，
 * 不会算出「一行 0 天」把渲染卡死。
 */
export async function getBandDays(board: BandDaysBoard): Promise<number> {
  const raw = (await cookies()).get(COOKIE[board])?.value;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? clampBandDays(n) : DEFAULT[board];
}

/** 只能在 Route Handler / Server Action 里调（Next 只许在那两处写 cookie） */
export async function setBandDays(board: BandDaysBoard, value: number) {
  (await cookies()).set(COOKIE[board], String(clampBandDays(value)), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
