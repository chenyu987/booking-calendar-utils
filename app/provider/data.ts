import { supabase } from "@/lib/supabase";

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
