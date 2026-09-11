// 资源清单的排序方式。
//
// 库里那条 .order("date_range_start") 排的是「资源什么时候开始生效」——
// 跟挑资源这件事没关系。挑资源时脑子里的顺序有两种：
//   · 年龄（登记了使用人的资源，年龄要跟客户对得上）
//   · 出借频率（谁排得多、谁一直闲着 —— 用来把生意匀开）
// 所以做成可选的，选中的记在 URL 里，跟别的筛选条件一个写法。

export const RESOURCE_SORTS = {
  "age-asc": "年龄 小 → 大",
  "age-desc": "年龄 大 → 小",
  "freq-desc": "排得多的在前",
  "freq-asc": "排得少的在前",
} as const;

export type ResourceSort = keyof typeof RESOURCE_SORTS;

export const DEFAULT_RESOURCE_SORT: ResourceSort = "age-asc";

/** URL 里那串不认识就退回默认，别让脏参数排出一个看不懂的顺序 */
export function parseResourceSort(raw?: string | null): ResourceSort {
  return raw && raw in RESOURCE_SORTS ? (raw as ResourceSort) : DEFAULT_RESOURCE_SORT;
}

export type SortableResource = {
  /** 没填就是 null */
  dateOfBirth: string | null | undefined;
  name: string;
  /** 被排出去过几次（按订单算，不是按天） */
  timesBooked: number;
  /** 一共被排掉几天 —— 次数一样时用它分先后 */
  daysBooked: number;
};

/**
 * 比较函数。
 *
 * 年龄那两档**不去算年龄，直接比生日字符串**：ISO 日期（1999-04-16）的字典序
 * 就是时间序，既省一次计算，也不会因为「今年生日过没过」在边界上抖动 ——
 * 同岁但差一天的两个人，顺序也是稳定的。
 *
 * 生日没填的永远沉底（不管升序降序）：年龄是分配的硬条件，填不出年龄的那几张
 * 本来就用不上，别插在中间打断顺序。
 *
 * 每一档最后都落到名字上兜底 —— 不然同岁 / 同频率的资源每次刷新位置都不一样，
 * 眼睛要重新找一遍。
 */
export function compareResources(
  sort: ResourceSort
): (a: SortableResource, b: SortableResource) => number {
  const byName = (a: SortableResource, b: SortableResource) => a.name.localeCompare(b.name);

  if (sort === "freq-desc" || sort === "freq-asc") {
    const dir = sort === "freq-desc" ? -1 : 1;
    return (a, b) => {
      if (a.timesBooked !== b.timesBooked) return (a.timesBooked - b.timesBooked) * dir;
      if (a.daysBooked !== b.daysBooked) return (a.daysBooked - b.daysBooked) * dir;
      return byName(a, b);
    };
  }

  const dir = sort === "age-asc" ? -1 : 1; // 年龄小 = 生日晚 = 字符串大
  return (a, b) => {
    const da = (a.dateOfBirth ?? "").trim();
    const db = (b.dateOfBirth ?? "").trim();
    if (!da !== !db) return da ? -1 : 1; // 没生日的沉底，跟升降序无关
    if (da !== db) return (da > db ? 1 : -1) * dir;
    return byName(a, b);
  };
}
