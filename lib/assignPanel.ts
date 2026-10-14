// 排期总览：选中一单之后，左边资源清单和顶上浮动条「哪些资源能配、推荐哪张」。
//
// 原来写在 page.tsx 里、服务端算（浮动条的候选一份、资源清单的 canAssignResource 一份，
// 是同一个判断写了两遍）。现在点一单要当场出结果（InstantAssign），资源清单和浮动条
// 搬到了客户端 —— 判断挪到这儿一份，服务端、客户端、两处界面都调它。
//
// 这只是「点得到 / 叫得出」：能不能真配上还是服务端说了算（lib/assignable.ts 的
// assignBlockReason，分配的 route 再验一遍）。所以这里漏放一张不要紧，但别多放。

import { calcAge } from "@/lib/age";
import { recommendResources, type PastUse, type Scored } from "@/lib/recommend";
import { coversOrder, itemConflictReason } from "@/lib/resourceStatus";

/** 选中的那一单，算资源清单和候选要的那几样。服务端每一单算一份，可序列化 */
export type PanelOrder = {
  id: string;
  customerId: string | null;
  /** 客户生日：推荐里年龄那条信号用（基本没人填，CLAUDE.md 待决定 #4） */
  customerDob: string | null;
  location: string | null;
  demandDays: string[];
  maleGap: number;
  femaleGap: number;
  /** 已经配给这一单的资源 */
  assignedResourceIds: string[];
};

/**
 * 这个资源（不看性别缺口）现在能不能配给这一单：挂牌中、类型进得了这个地点、有效期盖住
 * 这几天、这几天没被别的单占。性别缺口和「已经配给这单了」由调用方自己看。
 */
export function resourceOpenFor(
  s: any,
  order: Pick<PanelOrder, "location" | "demandDays">,
  bookedDaysOfResource: string[]
): boolean {
  if (s.status !== "active") return false;
  if (itemConflictReason(s, order.location)) return false;
  if (!coversOrder(s, order.demandDays)) return false;
  const booked = new Set(bookedDaysOfResource);
  return !order.demandDays.some((d) => booked.has(d));
}

/** 这一性别还差几张 */
export function gapFor(order: PanelOrder, gender: string | null | undefined): number {
  return gender === "male" ? order.maleGap : gender === "female" ? order.femaleGap : 0;
}

/** 推荐打分（只在传进来的候选里排序，绝不放宽校验）。返回 resourceId → 分数 */
export function recommendationsFor(
  order: PanelOrder,
  candidates: any[],
  bookedDays: Record<string, string[]>,
  history: PastUse[],
  assignedProviderIds: (string | null)[]
): Map<string, Scored> {
  return new Map(
    recommendResources({
      order: { customerId: order.customerId, location: order.location, demandDays: order.demandDays },
      customerAge: calcAge(order.customerDob),
      candidates: candidates.map((s: any) => ({
        id: s.id,
        itemType: s.item_type ?? null,
        holderDateOfBirth: s.holder_date_of_birth ?? null,
        providerId: s.provider_id ?? null,
        bookedDays: bookedDays[s.id] ?? [],
      })),
      history,
      // 物主没填的那几张跳过（recommend 里也是 filter(Boolean)，这里先滤掉好对上类型）
      assignedProviderIds: assignedProviderIds.filter((x): x is string => Boolean(x)),
    }).map((x) => [x.resourceId, x])
  );
}

/**
 * 顶上浮动条里「输入物主名字分配」的候选：配得上、这个性别还有缺口的资源，推荐的排前面。
 * 用全部资源（不是左边筛选后的）：打名字本来就是绕开左边筛选的快捷方式
 */
export function nameCandidates(
  order: PanelOrder,
  allResources: any[],
  bookedDays: Record<string, string[]>,
  history: PastUse[]
): { id: string; name: string; hint: string; score: number }[] {
  const assigned = new Set(order.assignedResourceIds);
  const ok = allResources.filter(
    (s: any) =>
      !assigned.has(s.id) &&
      resourceOpenFor(s, order, bookedDays[s.id] ?? []) &&
      // 这个性别还有缺口才算数：男资源配齐了就别再让人叫出男资源
      gapFor(order, s.holder_gender) > 0
  );
  const assignedProviderIds = allResources.filter((s: any) => assigned.has(s.id)).map((s: any) => s.provider_id);
  const scored = recommendationsFor(order, ok, bookedDays, history, assignedProviderIds);
  return ok
    .map((s: any) => ({
      id: s.id,
      name: (s.holder_name ?? "").trim(),
      hint: [
        s.holder_gender === "male" ? "男" : s.holder_gender === "female" ? "女" : "",
        calcAge(s.holder_date_of_birth) ? `${calcAge(s.holder_date_of_birth)}岁` : "",
        s.item_type ?? "",
        scored.get(s.id)?.top ? "★ 推荐" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      score: scored.get(s.id)?.score ?? 0,
    }))
    .filter((c) => c.name)
    .sort((a, b) => b.score - a.score);
}
