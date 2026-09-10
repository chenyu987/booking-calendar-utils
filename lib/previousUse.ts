// 分配的时候，把这一单用的这几个资源「上一次分别用在哪一单」找出来。
//
// 为什么要这个：分配不是孤立的一次决定。同一个资源上一单去哪儿了、结没结清、
// 人是不是同一个，都会影响这一单怎么排。以前要在日历上自己找，现在配上资源之后
// 直接把那几单点亮。
//
// 「上一次」按**结束日期**算，不按创建时间：补录历史单的时候创建时间是乱的，
// 但资源实际是哪天用的不会乱。

export type ResourceUse = { orderId: string; days: string[] };

/**
 * @param currentOrderId 正在配的这一单，要排除掉自己
 * @param currentDays    这一单的日期，用来定「之前」是哪个之前
 * @param resourceIds      这一单已经配上的资源
 * @param usesByResource   每个资源被哪些单用过
 * @returns 要点亮的订单 id。几个资源落在同一单上会自动去重；落在不同单上就都返回
 */
export function previousOrdersFor(
  currentOrderId: string,
  currentDays: string[],
  resourceIds: string[],
  usesByResource: Map<string, ResourceUse[]>
): Set<string> {
  const out = new Set<string>();
  const start = [...currentDays].sort()[0];
  if (!start) return out;

  for (const resourceId of resourceIds) {
    let best: { end: string; orderId: string } | null = null;
    for (const use of usesByResource.get(resourceId) ?? []) {
      if (use.orderId === currentOrderId) continue;
      const end = [...use.days].sort().at(-1);
      // 只要**整单**都在这一单开始之前才算「上一次」。跨过来的那种还在用着，
      // 不是「上一次」，而且它已经在日历上跟这一单挨着了，点亮没有信息量
      if (!end || end >= start) continue;
      if (!best || end > best.end) best = { end, orderId: use.orderId };
    }
    if (best) out.add(best.orderId);
  }
  return out;
}
