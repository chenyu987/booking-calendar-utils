import {
  extraAssignmentReason,
  findConflictingDays,
} from "./assignment";
import { coversOrder, formatValidity, itemConflictReason } from "./resourceStatus";

/**
 * 「这个资源能不能配进这一单」—— 分配的全部校验，**唯一出处**。
 *
 * 为什么要抽出来：这套判断原来在排期总览的 assign route 和匹配台的 chosen 分支里
 * **各抄了一遍，一字不差**。正是 CLAUDE.md 里那个栽过四次的模式 —— 两份东西
 * 各自维护，改了一边忘了另一边，而这一边恰好是「配错资源」这种代价最大的地方。
 * 现在第三个调用方（物主提意向）进来，再抄一遍就是三份。
 *
 * 顺序有讲究，别乱动：先看挂牌状态（最便宜、最常见），再看配多了/配重了，
 * 然后类型进不进得了这个地点，再看有效期，最后才是撞天。报错信息按这个顺序
 * 给出第一条不成立的，已有的集成测试盯着这些原话。
 *
 * @param resourceBookedDays 这个资源在**别的**订单上已经占掉的日子（不含这一单自己的）
 * @returns 能配返回 null，不能配返回一句人话
 */
export function assignBlockReason(input: {
  order: {
    demand_days?: string[] | null;
    male_count?: number | null;
    female_count?: number | null;
    location?: string | null;
  };
  resource: {
    id?: string;
    status?: string | null;
    holder_name?: string | null;
    holder_gender?: string | null;
    item_type?: string | null;
    date_range_start?: string | null;
    date_range_end?: string | null;
  };
  alreadyAssigned: { id?: string; holder_gender?: string | null }[];
  resourceBookedDays: string[];
}): string | null {
  const { order, resource, alreadyAssigned, resourceBookedDays } = input;
  const name = resource.holder_name ?? "这个资源";

  if (resource.status !== "active") return "这个资源不在出租中";

  // 配多了 / 配重了。以前只靠界面藏按钮，拖拽分配一上来就把这个洞暴露了
  const extra = extraAssignmentReason(order, alreadyAssigned, resource);
  if (extra) return extra;

  // 类型要能进这个地点。地点名认不出来就不拦 —— 判断不了不等于不合法
  const itemConflict = itemConflictReason(resource, order.location);
  if (itemConflict) return itemConflict;

  // 判断依据是「订单那几天资源有没有效」，不是「今天资源过没过期」
  if (!coversOrder(resource, order.demand_days ?? [])) {
    return `${name} 的有效期是 ${formatValidity(resource)}，覆盖不了这一单的日期`;
  }

  // 同一个资源同一天不能配给两个订单
  const conflictDays = findConflictingDays(order.demand_days ?? [], resourceBookedDays);
  if (conflictDays.length > 0) {
    return `${name} 在 ${conflictDays.join("、")} 已经配给别的订单了`;
  }

  return null;
}
