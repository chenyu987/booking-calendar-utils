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
  if (resource.status === "archived") return { text: "已下架", color: "#999" };
  if (resource.status === "paused") return { text: "暂停", color: "#a8620d" };
  if (isExpired(resource)) return { text: "已过期", color: "#999" };
  return { text: "出租中", color: "#1f5c33" };
}

// 只在「不正常」时才给标签。正常出租中是默认情况，不用占地方提醒。
export function abnormalBadge(
  resource: any
): { text: string; color: string } | null {
  const badge = statusBadge(resource);
  return badge.text === "出租中" ? null : badge;
}
