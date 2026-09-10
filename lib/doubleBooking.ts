// 同一个资源在同一天被配给了两个订单 —— 「分配三条校验」里的第 3 条。
//
// 分配那条路（addAssignment / 匹配台）一直是拦着的，但**改日期那条路没拦**：
// 把一个已经配好资源的单子往前拖一天，那一天正好撞上同一个资源在别的单子上的日子，
// 就这么写进库了。数据一旦变成这样，两条分配路径都造不出来，只能靠界面提醒人去修。
//
// 所以这里做两件事：拖拽时提前算出来拦掉；以及把库里已经存在的冲突找出来标红
// （数据可能从别的地方进来 —— 两个人同时操作、直接改库、以前留下的）。

export type Booking = { orderId: string; days: string[] };

export type Clash = {
  resourceId: string;
  orderId: string;
  /** 跟哪一单撞了 */
  otherOrderId: string;
  /** 撞在哪几天（排过序） */
  days: string[];
};

/** 两个日期数组的交集，排过序、去过重 */
export function overlappingDays(a: string[], b: string[]): string[] {
  const bs = new Set(b);
  return [...new Set(a.filter((d) => bs.has(d)))].sort();
}

/**
 * 把所有「同一个资源同一天配给两单」找出来。
 *
 * @param usesByResource 每个资源被哪些单占了哪几天
 * @returns 每个冲突出现**两次**（A 跟 B 撞、B 跟 A 撞）—— 界面上两个单子都要标红，
 *          所以两边都得能查到
 */
export function findClashes(usesByResource: Map<string, Booking[]>): Clash[] {
  const out: Clash[] = [];
  for (const [resourceId, uses] of usesByResource) {
    for (let i = 0; i < uses.length; i++) {
      for (let j = i + 1; j < uses.length; j++) {
        // 同一个订单被拆成好几条记录时不算自己跟自己撞
        if (uses[i].orderId === uses[j].orderId) continue;
        const days = overlappingDays(uses[i].days, uses[j].days);
        if (days.length === 0) continue;
        out.push({ resourceId, orderId: uses[i].orderId, otherOrderId: uses[j].orderId, days });
        out.push({ resourceId, orderId: uses[j].orderId, otherOrderId: uses[i].orderId, days });
      }
    }
  }
  return out;
}

/** 按「订单 + 资源」索引，界面上一个资源一个资源地查「它冲不冲」 */
export function clashKey(orderId: string, resourceId: string): string {
  return `${orderId}|${resourceId}`;
}

export function indexClashes(clashes: Clash[]): Map<string, Clash[]> {
  const m = new Map<string, Clash[]>();
  for (const c of clashes) {
    const k = clashKey(c.orderId, c.resourceId);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
}

/**
 * 这一单改成新日期之后，配在它上面的资源会不会跟别的单撞。
 * 拖拽改日期之前拿它拦一道 —— 别把冲突写进库。
 *
 * @param assigned 这一单配了哪些资源（带物主姓名，报错信息里要说清是哪张）
 * @param otherBookings 这些卡在**别的**单子上占了哪几天
 */
export function resizeConflictReason(
  newDays: string[],
  assigned: { resourceId: string; holderName: string | null }[],
  otherBookings: Map<string, Booking[]>
): string | null {
  for (const a of assigned) {
    for (const b of otherBookings.get(a.resourceId) ?? []) {
      const days = overlappingDays(newDays, b.days);
      if (days.length > 0) {
        return `${a.holderName ?? "这个资源"} 在 ${days.join("、")} 已经配给别的订单了，改成这个日期会撞上`;
      }
    }
  }
  return null;
}
