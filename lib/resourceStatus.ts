import { normalizeLocation, requiredItem } from "@/lib/locations";

import { todayIso } from "./dates";

// 挂牌本身的状态 —— 只有人知道，算不出来
export const RESOURCE_STATUSES = ["active", "paused", "archived"] as const;

export const RESOURCE_STATUS_LABELS: Record<string, string> = {
  active: "出租中",
  paused: "暂停",
  archived: "已下架",
};

/**
 * 有效期是**两头各自选填**的，留空 = 这一头不设限。
 *
 * 为什么允许留空：整季通用的资源本来就没有起止，物主说不出准确日期。逼他填一个
 * 就只有两种结果 —— 要么瞎填一个，那是**假数据**，会在分配那一刻把一张合法的资源
 * 拦掉；要么他干脆不挂了。留空至少是诚实的：界面上显示「不限」，管理员一眼看到
 * 这一头没人核实过，自己拿主意。
 *
 * 跟 itemConflictReason 里那句「判断不了就不拦」是同一条：**宁可漏拦也不能错拦**。
 * 错拦把一张好资源按死，而管理员没有绕过去的办法。
 */
export const VALIDITY_OPEN_LABEL = "不限";

/**
 * 物主把这个资源「删了」。**软删除** —— 行还在库里（迁移 `0013`）。
 *
 * 谁看得见：物主那边当它不存在；admin 的 `/admin/resources` 照常列出来并标「已删除」，
 * 排期总览和匹配台的选资源器排除掉（那两处是干活的地方）。分配校验也拦着。
 */
export function isDeleted(resource: any): boolean {
  return Boolean(resource?.deleted_at);
}

// 过期与否拿有效期跟今天比，不存字段。结束日留空的资源永远不算过期 —— 没有上限。
export function isExpired(resource: any): boolean {
  return Boolean(resource.date_range_end) && resource.date_range_end < todayIso();
}

// 有效期显示成一句话，**唯一出处** —— 物主页、Resource 管理、匹配台、排期总览的
// 浮层都用它。散着写的话，加了「不限」这一档就得记得改五个地方。
/**
 * 「一头或两头可空的日期区间」怎么显示 —— **唯一出处**。
 * 资源的有效期和介绍关系的返点窗口是同一种东西（迁移 0012 / 0015 用了同一套
 * 「空 = 这一头不设限」的约定），显示当然也该是同一份代码。
 */
export function formatDateRange(
  start?: string | null,
  end?: string | null
): string {
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} 起`;
  if (end) return `截至 ${end}`;
  return VALIDITY_OPEN_LABEL;
}

export function formatValidity(resource: any): string {
  return formatDateRange(resource?.date_range_start, resource?.date_range_end);
}

// 这个资源的有效期能不能覆盖这一单的全部日期。
// 注意：判断依据是「订单那几天资源还有效」，不是「今天资源有没有过期」——
// 一张 9 月过期的资源，配 8 月的单子是合法的。
//
// 留空的那一头不参与判断（见上面 VALIDITY_OPEN_LABEL 的说明）：两头都空的资源
// 任何日期都覆盖得了，只填了开始日的资源管住「不能配更早的」。
export function coversOrder(resource: any, demandDays: string[]): boolean {
  if (!demandDays?.length) return false;
  const start = resource?.date_range_start;
  const end = resource?.date_range_end;
  return demandDays.every((d) => (!start || d >= start) && (!end || d <= end));
}

// 卡片上那个小标签：优先显示挂牌状态，其次显示是不是过期了
export function statusBadge(resource: any): { text: string; color: string } {
  // 删掉的排最前面：它压过其它一切状态
  if (isDeleted(resource)) return { text: "已删除", color: "var(--danger)" };
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
