import { cookies } from "next/headers";

import { supabase } from "@/lib/supabase";
import { clampProviderBandDays, PROVIDER_BAND_DAYS_DEFAULT } from "@/lib/providerBoard";
import { isIsoDate } from "@/lib/timelineStart";

// 物主这一页要的几个查询。**不是 lib/** —— lib 那一层按约定全是纯逻辑、不连库，
// 单测才跑得起来。这里连库，所以留在页面这一侧。

/**
 * 每个资源被排出去的日子 = 配到这个资源的所有订单的 demand_days 并集。
 * 不存字段，实时算 —— 跟排期总览一个算法。
 *
 * 只查 demand_days，**不查 customer**：物主不该看到客户是谁。
 *
 * @param exceptOrderId 算「还能不能接这一单」时要把这一单自己的日子排除掉，
 *                      否则它会跟自己撞上
 */
export async function bookedDaysFor(
  resourceIds: string[],
  exceptOrderId?: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (resourceIds.length === 0) return map;
  let q = supabase
    .from("order_assignments")
    .select("resource_id, order_id, orders(demand_days)")
    .in("resource_id", resourceIds);
  if (exceptOrderId) q = q.neq("order_id", exceptOrderId);
  const { data } = await q;
  for (const a of data ?? []) {
    const days = (a as any).orders?.demand_days ?? [];
    if (days.length === 0) continue;
    map.set(a.resource_id, [...(map.get(a.resource_id) ?? []), ...days]);
  }
  return map;
}

// 物主那张日历怎么看：每行几天、从哪天开始。
//
// **存 cookie 不存库。** admin 那两个同名设置在 `app_settings` 里，但那是一张
// 全局 key/value 表 —— 单 admin 够用，物主是多用户，共用一行等于互相改对方的。
// 而且这两个本来就是「这台机器上我习惯怎么看」（手机 7 天一行、桌面 28），
// 跟缩放、面板宽度同一类，`lib/appSettings.ts` 开头那段写的就是这条界线。
export const VIEW_COOKIES = {
  bandDays: "provider_band_days",
  start: "provider_start",
} as const;

export function readViewSettings(): { bandDays: number; start: string } {
  const jar = cookies();
  const raw = jar.get(VIEW_COOKIES.start)?.value ?? "";
  return {
    bandDays: clampProviderBandDays(jar.get(VIEW_COOKIES.bandDays)?.value ?? PROVIDER_BAND_DAYS_DEFAULT),
    // 库里/cookie 里存了个不存在的日子（2026-02-31 这种）就当没设 ——
    // 放过去的话 new Date 会把它悄悄滚到 3 月，日历从一个谁也说不清的地方开始
    start: isIsoDate(raw) ? raw : "",
  };
}
