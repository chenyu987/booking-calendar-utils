import { RESOURCE_STATUSES, coversOrder } from "./resourceStatus";

// 物主自助改资源信息的校验。
//
// **为什么要单独一份服务端校验**：这是第四条能改动分配前提的路径 —— 前三条
// （排期总览分配、匹配台 chosen、拖日期）改的是订单那一侧，这条改的是资源那一侧。
// 一张已经排出去的资源，物主把有效期缩短一天、或者把性别一改，分配时校验过的
// 那几条当场就不成立了，而没有任何地方会重新验一遍。所以在写进去之前拦住。
//
// 界面上也会把这些字段禁掉，但那挡不住 curl —— 判断标准见 CLAUDE.md。

export type ResourceEditInput = {
  itemType: string;
  holderName: string;
  holderGender: string;
  // 有效期两头各自选填，留空 = 这一头不设限（见 lib/resourceStatus.ts）
  dateRangeStart: string;
  dateRangeEnd: string;
  status: string;
};

export type ResourceEditError =
  | "required" // 必填的没填全
  | "dates" // 结束日期早于开始日期
  | "range" // 有效期盖不住已排出去的日子
  | "gender" // 已经排出去了，不给改持有人性别
  | "status"; // 状态不是三个合法值之一

export const RESOURCE_EDIT_ERRORS: Record<ResourceEditError, string> = {
  required: "类型和持有人的姓名、性别都得填。",
  dates: "结束日期不能早于开始日期。",
  range: "有效期得盖住已经排出去的那几天 —— 要改成盖不住的，先联系我们。",
  // 「不限」这一档不会触发 range：两头都留空的资源什么日子都盖得住
  gender: "这个资源已经排出去了，持有人性别不能改 —— 客户是按性别配的。要改先联系我们。",
  status: "资源状态不对。",
};

/**
 * @param next     物主提交上来的新值
 * @param current  库里现在这个资源（只看 holder_gender）
 * @param bookedDays 这个资源已经被排出去的日子（配到它的所有订单 demand_days 的并集）
 * @returns 错误码，没问题返回 null
 */
export function validateResourceEdit(
  next: ResourceEditInput,
  current: { holder_gender?: string | null },
  bookedDays: string[]
): ResourceEditError | null {
  if (next.itemType !== "beta" && next.itemType !== "alpha") return "required";
  if (!next.holderName.trim()) return "required";
  if (next.holderGender !== "male" && next.holderGender !== "female") return "required";
  // 有效期两头都可以空着。两头都填了才有「先后」可言
  if (
    next.dateRangeStart &&
    next.dateRangeEnd &&
    next.dateRangeEnd < next.dateRangeStart
  ) {
    return "dates";
  }
  if (!(RESOURCE_STATUSES as readonly string[]).includes(next.status)) return "status";

  // 没排出去的资源随便改 —— 下面两条都只在「已经有订单靠着它」的时候才成立
  if (bookedDays.length === 0) return null;

  // 判断依据是「已排的那几天在不在新有效期里」，不是「今天过没过期」——
  // 补录的历史单也得算数。直接借 coversOrder：分配那一刻用的就是它，
  // 这里再写一遍同样的比较，哪天「留空 = 不设限」的规则改了就会漏掉一边
  const covers = coversOrder(
    { date_range_start: next.dateRangeStart || null, date_range_end: next.dateRangeEnd || null },
    bookedDays
  );
  if (!covers) return "range";

  // 性别是硬条件不是参考信息：物品登记了使用人，客户核验时要对得上人。
  // 改了性别，已经配在这个资源上的订单就配错了，而分配那一刻的校验不会再跑。
  if (current.holder_gender && current.holder_gender !== next.holderGender) {
    return "gender";
  }

  // 暂停 / 下架是**允许**的：status 只表达挂牌生命周期（还接不接新单），
  // 不表达「被占了没」。已经排出去的那几天照常生效，不受影响。
  return null;
}

/**
 * 物主能不能**删掉**这张资源。（软删除，只打 `deleted_at`，行留在库里 —— 迁移 `0013`）
 *
 * **已经排出去的不给删。** 不是怕丢数据（软删除没这个问题），是因为「删掉」对物主
 * 意味着这个资源从此不存在，而它此刻正实实在在地服务着几个订单 —— 那几天客户拿的
 * 就是这个资源。删了之后排期总览里它会消失，订单却还挂着 `itemAssigned`，
 * 到取资源那天没人知道卡在哪儿。
 *
 * 删除是给**挂错了**用的（填错了、重复挂了一张）。「不租了」有专门的办法：
 * 改成暂停或已下架 —— status 只管接不接新单，已经排出去的那几天照常生效。
 * 这两件事不该用同一个按钮。
 *
 * @param bookedDays 这个资源已经被排出去的日子
 * @returns 能删返回 null，不能删返回一句人话
 */
export function deleteBlockReason(bookedDays: string[]): string | null {
  if (bookedDays.length > 0) {
    return "这个资源已经排出去了，删不了 —— 那几天客户拿的就是它。不想再出租的话改成「暂停」或「已下架」，已经排出去的那几天照常生效。";
  }
  return null;
}
