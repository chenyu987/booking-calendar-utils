// 资源类型：类型（item_type：beta / alpha）+ Beta 分档（item_tier：base / full / 空 = 还不知道，迁移 0034）
// 合起来给人看、给人选的那一个值。Resource 管理的显示、筛选、排序、新增 / 编辑表单都走这里。
//
// 库里还是两列：item_type 只管「哪一边」，地点和类型对不对得上、分配校验都只读它；
// 分档是多出来的一层，只有这几处界面要用。

export const ITEM_KINDS = ["alpha", "beta-base", "beta-full", "beta-unknown"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  alpha: "alpha",
  "beta-base": "beta base",
  "beta-full": "beta full",
  "beta-unknown": "beta unknown",
};

/** 一个资源是哪一类。类型没填的（老数据）返回 null */
export function itemKind(s: { item_type?: string | null; item_tier?: string | null }): ItemKind | null {
  if (s.item_type === "alpha") return "alpha";
  if (s.item_type !== "beta") return null;
  if (s.item_tier === "base") return "beta-base";
  if (s.item_tier === "full") return "beta-full";
  return "beta-unknown";
}

/** 表单上选的那个值 → 写库的两列。认不出来返回 null（服务端拒掉） */
export function itemColumns(kind: string): { item_type: "alpha" | "beta"; item_tier: "base" | "full" | null } | null {
  switch (kind) {
    case "alpha":
      return { item_type: "alpha", item_tier: null };
    case "beta-base":
      return { item_type: "beta", item_tier: "base" };
    case "beta-full":
      return { item_type: "beta", item_tier: "full" };
    case "beta-unknown":
    // 老表单 / 老链接里的 beta：没说哪档，就是还不知道
    case "beta":
      return { item_type: "beta", item_tier: null };
    default:
      return null;
  }
}

/**
 * 筛选：URL 上 `item=alpha,beta-full` 逗号隔开（也认同名参数重复几次）。
 * 老链接的 `item=beta` 展开成三档 beta。认不出来的丢掉，全都认不出 = 不筛
 */
export function parseItemKinds(raw: string | string[] | undefined): ItemKind[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(","));
  const out = new Set<ItemKind>();
  for (const p of parts.map((x) => x.trim())) {
    if (p === "beta") ["beta-base", "beta-full", "beta-unknown"].forEach((k) => out.add(k as ItemKind));
    else if ((ITEM_KINDS as readonly string[]).includes(p)) out.add(p as ItemKind);
  }
  // 按固定顺序排，URL 不会因为勾选先后不同而不一样
  return ITEM_KINDS.filter((k) => out.has(k));
}
