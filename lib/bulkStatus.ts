// 批量改订单状态：哪些状态可以一次设给一批单子。
//
// 关键约束（CLAUDE.md 的硬规则）：`created` 和 `itemAssigned` 这两个状态是**分配
// 进度算出来的**，不是人挑的——`orders.status` 从 created 推进到 itemAssigned
// 只在配齐的那一刻发生，`syncedAssignmentStatus` 还会在撤销分配时把它打回去。
//
// 所以批量设置只放开下游那几个「人工流程」状态。要是允许批量设成 itemAssigned，
// 就会出现：一次把 10 单标成「已分配」，其中几单其实没配齐，过两天有人撤了个资源，
// 那几单又自己变回「待处理」——数据看着改了，实际会自己变回去，最难查的那类 bug。
//
// 这几个状态要单个改，还是走色块里的下拉框（那里是单个单子，看得见分配进度）。
export const DERIVED_STATUSES = ["created", "itemAssigned"] as const;

// 顺序跟 STATUS_LABELS 保持一致，下拉框里读起来是同一条流程线。
// unconfirmed 和 needRefund 都是纯人工状态（syncedAssignmentStatus 只碰
// created/itemAssigned，不会把它们冲掉），所以可以批量设。
export const BULK_SETTABLE_STATUSES = [
  "pendingPickUp",
  "pendingPayment",
  "complete",
  "unconfirmed",
  "cancelled",
  "needRefund",
] as const;

export function canBulkSet(status: string): boolean {
  return (BULK_SETTABLE_STATUSES as readonly string[]).includes(status);
}

// 不能批量设的时候，给一句说得清为什么的话（直接显示给用户）
export function bulkSetRejection(status: string): string | null {
  if (canBulkSet(status)) return null;
  if ((DERIVED_STATUSES as readonly string[]).includes(status)) {
    return "「待处理」和「已分配」是按分配进度自动算的，不能批量设置——请在单个订单里改";
  }
  return "未知状态";
}

// 选中的一批单子当前是什么状态：全一样就返回那个状态，不一样返回 null
// （下拉框得显示「多个状态」，不能挑其中一个显示，不然会以为整批都是它）
export function commonStatus(statuses: string[]): string | null {
  if (statuses.length === 0) return null;
  const first = statuses[0];
  return statuses.every((s) => s === first) ? first : null;
}

// 一批 id 里，去重 + 去掉空的。选中集是客户端攒的，可能有重复或者已经被删掉的单子
export function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id.trim()) out.add(id.trim());
  }
  return [...out];
}
