// Resource 管理列表的「点表头排序」。
//
// 跟 lib/resourceSort.ts 不是一回事：那个是排期总览资源清单的四档预设（年龄 / 排得多少），
// 这个是列表页每一列都能排。
//
// 设计：**表头那一行管排序，表头底下那一行管筛选**，同一列上下对齐 —— 一列的两件事
// 叠在同一个竖条里，不另起一排控件。点表头：升序 → 降序 → 回到默认（新挂的在上）。
// 排序跟筛选一样写在 URL 上（sort / dir），刷新、收藏、分享照旧。
//
// 纯函数，页面把每一行整理好传进来，所以能单测（跟 resourceFilter.ts 一个路子）。

import { BADGE_KINDS, type BadgeKind } from "./resourceStatus";

export const RESOURCE_LIST_SORT_KEYS = [
  "provider",
  "item",
  "holder",
  "gender",
  "dob",
  "age",
  "validity",
  "booked",
  "address",
  "contact",
  "status",
] as const;
export type ResourceListSortKey = (typeof RESOURCE_LIST_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** sort 为空 = 默认顺序（库里按 created_at 倒序拉回来的那个顺序，不再动它） */
export type ResourceListSort = { sort: ResourceListSortKey | ""; dir: SortDir };

export const DEFAULT_RESOURCE_LIST_SORT: ResourceListSort = { sort: "", dir: "asc" };

/** URL 上认不出的一律当没排，不报错 */
export function parseResourceListSort(sp: Record<string, string | undefined>): ResourceListSort {
  const sort = (sp.sort ?? "").trim();
  if (!(RESOURCE_LIST_SORT_KEYS as readonly string[]).includes(sort)) return DEFAULT_RESOURCE_LIST_SORT;
  return { sort: sort as ResourceListSortKey, dir: (sp.dir ?? "").trim() === "desc" ? "desc" : "asc" };
}

/** 点一下这一列表头之后变成什么：没在排它 → 升序；升序 → 降序；降序 → 不排（回默认） */
export function nextSort(cur: ResourceListSort, key: ResourceListSortKey): ResourceListSort {
  if (cur.sort !== key) return { sort: key, dir: "asc" };
  if (cur.dir === "asc") return { sort: key, dir: "desc" };
  return DEFAULT_RESOURCE_LIST_SORT;
}

/** 拼进 URL 的参数。默认顺序什么都不写 */
export function sortParams(s: ResourceListSort): Record<string, string> {
  return s.sort ? { sort: s.sort, dir: s.dir } : {};
}

export type SortableResourceRow = {
  providerName: string;
  /** itemKind(resource)，字母序正好是 alpha → beta base → full → unknown */
  itemKind: string | null;
  holderName: string | null;
  holderGender: string | null;
  /** YYYY-MM-DD */
  dob: string | null;
  /** 有效期最早的开始日；null = 不设下限 */
  validFrom: string | null;
  bookingCount: number;
  badge: BadgeKind;
  /** 物主在哪：国家 / 州 / 城市，按这个顺序比（同一个州的挨在一起）；没填是 null */
  /** 物主挂在哪几个管理员名下，按名字接成一串比（「Admin1、admin2」）；没标是空数组 */
  contactNames?: string[];
  address?: { country?: string | null; region?: string | null; city?: string | null } | null;
};

type Key = string | number | null;

function keyOf(r: SortableResourceRow, k: ResourceListSortKey): Key {
  const s = (v: string | null) => (v && v.trim() ? v.trim().toLowerCase() : null);
  switch (k) {
    case "provider":
      return r.providerName && r.providerName !== "-" ? r.providerName.toLowerCase() : null;
    case "item":
      return s(r.itemKind);
    case "holder":
      return s(r.holderName);
    case "gender":
      return s(r.holderGender);
    // 生日和年龄都直接比生日字符串（ISO 日期的字典序就是时间序）：
    // 年龄升序 = 年轻的在前 = 生日晚的在前，所以年龄那列方向反过来（在 compare 里处理）
    case "dob":
    case "age":
      return s(r.dob);
    // 「不设下限」的资源排在最前（它比谁都早），不是当成「不知道」沉底
    case "validity":
      return r.validFrom ?? "";
    case "booked":
      return r.bookingCount;
    case "contact":
      return r.contactNames?.length ? r.contactNames.join("、").toLowerCase() : null;
    case "address": {
      const a = r.address;
      const parts = [a?.country, a?.region, a?.city].map((x) => (x ?? "").trim().toLowerCase());
      return parts.some(Boolean) ? parts.join("|") : null;
    }
    // 按标签在 BADGE_KINDS 里的先后：出租中 → 已过期 → 暂停 → 已下架 → 已删除
    case "status":
      return BADGE_KINDS.indexOf(r.badge);
  }
}

/**
 * 排好的新数组（不动原数组）。
 * - 空值（没填名字、没填生日……）**不管升降都沉底**：它们不是最小也不是最大，是不知道
 * - 比不出先后的保持原来的顺序（Array.sort 是稳定的），也就是默认的「新挂的在上」
 */
export function sortResourceRows<T>(
  rows: T[],
  s: ResourceListSort,
  toRow: (r: T) => SortableResourceRow
): T[] {
  if (!s.sort) return rows;
  const k = s.sort;
  // 年龄升序 = 生日降序
  const sign = (s.dir === "asc" ? 1 : -1) * (k === "age" ? -1 : 1);
  const keyed = rows.map((r) => ({ r, key: keyOf(toRow(r), k) }));
  keyed.sort((a, b) => {
    const x = a.key, y = b.key;
    if (x === null || y === null) return x !== null ? -1 : y !== null ? 1 : 0;
    if (typeof x === "number" && typeof y === "number") return sign * (x - y);
    return sign * String(x).localeCompare(String(y), "zh");
  });
  return keyed.map((x) => x.r);
}
