import { normalizeLocation, requiredItem } from "@/lib/locations";

import { todayIso } from "./dates";

// 挂牌本身的状态 —— 只有人知道，算不出来
export const RESOURCE_STATUSES = ["active", "paused", "archived"] as const;

export const RESOURCE_STATUS_LABELS: Record<string, string> = {
  active: "出租中",
  paused: "暂停",
  archived: "已下架",
};

// 过期与否拿有效期跟今天比，不存字段
export function isExpired(resource: any): boolean {
  return Boolean(resource.date_range_end) && resource.date_range_end < todayIso();
}

// 这个资源的有效期能不能覆盖这一单的全部日期。
// 注意：判断依据是「订单那几天资源还有效」，不是「今天资源有没有过期」——
// 一张 9 月过期的资源，配 8 月的单子是合法的。
export function coversOrder(resource: any, demandDays: string[]): boolean {
  if (!demandDays?.length) return false;
  return demandDays.every(
    (d) => d >= resource.date_range_start && d <= resource.date_range_end
  );
}

// 卡片上那个小标签：优先显示挂牌状态，其次显示是不是过期了
export function statusBadge(resource: any): { text: string; color: string } {
  if (resource.status === "archived") return { text: "已下架", color: "var(--text-faint)" };
  if (resource.status === "paused") return { text: "暂停", color: "var(--warn)" };
  if (isExpired(resource)) return { text: "已过期", color: "var(--text-faint)" };
  return { text: "出租中", color: "var(--ok)" };
}

// 只在「不正常」时才给标签。正常出租中是默认情况，不用占地方提醒。
export function abnormalBadge(
  resource: any
): { text: string; color: string } | null {
  const badge = statusBadge(resource);
  return badge.text === "出租中" ? null : badge;
}

/**
 * 第四条分配校验：类型要能进这个地点。
 *
 * 物品是按 item 生态发的，Alpha 的核验不认 Beta 资源 —— 这跟「有效期覆盖不了」
 * 一样是硬伤，客户人都到地点上了才被拦下来，代价比配错日期还大。
 *
 * **地点名认不出来（没填、写错、库里没有）就返回 null —— 判断不了就不拦。**
 * 这一条依赖「这个场地今年归谁」这种外部知识，跟前三条「全在库里」的性质不同，
 * 所以宁可漏拦也不能错拦：错拦会把一张合法的资源按死，而管理员没有绕过的办法。
 */
export function itemConflictReason(
  resource: { item_type?: string | null; holder_name?: string | null },
  location?: string | null
): string | null {
  const need = requiredItem(location);
  if (!need) return null;
  const has = resource?.item_type;
  if (has !== "beta" && has !== "alpha") return null; // 类型没填，判断不了
  if (has === need) return null;
  const label = normalizeLocation(location)?.canonical ?? location;
  return `${label} 收的是 ${need} 资源，${resource?.holder_name ?? "这个资源"} 是 ${has} 资源，进不去`;
}
