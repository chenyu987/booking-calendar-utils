import { supabase } from "@/lib/supabase";
import { assignBlockReason } from "@/lib/assignable";

import { bookedDaysFor } from "./data";

/**
 * 提一条意向。**校验和写库这一份只有一处** —— 日历上点资源名走的是
 * `app/provider/propose/route.ts`，两条路都调它。
 *
 * 返回错误码而不是抛/跳转：路由那边要把它变成 400 + 一句中文，
 * 由客户端当场显示出来，不经过一次整页渲染。
 */
export type ProposeError = "notmine" | "blocked" | "dup" | "save";

/**
 * @param providerIdPromise 传的是**还没 await 的那个 Promise**。认领身份要往
 *   Supabase 跑一趟，而下面这几个查询一个都不依赖「我是谁」（资源是不是我的，
 *   查出来之后比一下 provider_id 就知道）。串着等就是白搭一个来回，
 *   这一页每个来回都是几百毫秒。
 */
export async function proposeIntent(
  providerIdPromise: Promise<string> | string,
  orderId: string,
  resourceId: string
): Promise<ProposeError | null> {
  if (!orderId || !resourceId) return "blocked";

  // **五个查询一起发，还跟认身份那一趟并着跑。** 原来是「认身份 → 查资源确认是我的
  // → 并发查单/分配/重复 → 查这个资源被占了哪几天」，四段串起来四个来回。
  // 这几件事彼此并不依赖，判断的先后不影响结果：卡不是我的就整个作废，
  // 晚一点判跟早一点判一样。省下来的是人能直接感觉到的那一两秒
  const [{ data: sup }, { data: ord }, { data: assignedRows }, { data: dup }, bookedMap] =
    await Promise.all([
      supabase
        .from("resources")
        .select(
          "id, provider_id, status, deleted_at, holder_name, holder_gender, item_type, date_range_start, date_range_end"
        )
        .eq("id", resourceId)
        // 删掉的资源物主那边就当它不存在
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, status, location, demand_days, male_count, female_count")
        .eq("id", orderId)
        .maybeSingle(),
      supabase
        .from("order_assignments")
        .select("resources(id, holder_gender)")
        .eq("order_id", orderId),
      supabase
        .from("matches")
        .select("id")
        .eq("order_id", orderId)
        .eq("resource_id", resourceId)
        .in("status", ["proposed", "allowed", "chosen"])
        .maybeSingle(),
      bookedDaysFor([resourceId], orderId),
    ]);

  // **认 provider_id，不是只认 id** —— 只按 id 提的话，换个 id 就能拿别人的资源提意向。
  // 查的时候没带 provider_id 条件（那样就得先等认领那一趟），查回来再比一次，一样严
  const providerId = await providerIdPromise;
  if (!sup || sup.provider_id !== providerId) return "notmine";
  if (!ord || ord.status !== "created") return "blocked";
  // 同一个资源对同一单提两次没有意义，只会把匹配台刷满
  if (dup) return "dup";

  const booked = bookedMap.get(resourceId) ?? [];
  const blocked = assignBlockReason({
    order: ord,
    resource: sup,
    alreadyAssigned: (assignedRows ?? []).map((r: any) => r.resources).filter(Boolean),
    resourceBookedDays: booked,
  });
  if (blocked) return "blocked";

  // Provider 从 resource 推得出来，不重复存
  const { error } = await supabase
    .from("matches")
    .insert({ order_id: orderId, resource_id: resourceId, status: "proposed" });
  if (error) return "save";

  return null;
}
