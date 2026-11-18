import type { RowsRequest } from "@/lib/overviewLive";

// 排期总览：「自己存完只拉改了的那几行」要的两样，模块级一份（跟 assignSelection.ts 一个道理：
// 存的那些组件和拿着数据的 OverviewBoard 在树上隔得远，中间是服务端组件，context 穿不过去）。
//
//   - refetchRows：存完调它，只拉这几单 / 这几个资源合进日历（useLiveRaw 登记的）。
//     **返回 false = 没人登记**（OverviewBoard 还没挂上），调用方退回 router.refresh 整页重拉
//   - mergedAt：每一单最近一次单独拉回来的服务端时间。先画上去的新值（blockPatch.ts 的补丁、
//     拖过去的那个影子）要等「存完之后才查的数据」到了才撤，原来只看整页渲染的
//     main[data-rendered-at]，不整页刷新以后它不会前进 —— 改成按单看这个

/**
 * own = 自己刚存的：正在编辑的那一单也照样合（别人的改动要等退出编辑才合，见 useLiveRaw；
 * 自己拖边改了天数、配了一个资源，编辑框得当场跟着变）
 */
type Fetcher = (req: Partial<RowsRequest>, own: boolean) => Promise<boolean>;

let fetcher: Fetcher | null = null;
const merged = new Map<string, number>();
const listeners = new Set<() => void>();

export function registerLiveFetcher(fn: Fetcher | null) {
  fetcher = fn;
}

/** 自己存完：只拉这几行合进日历。拉到并合进去了返回 true；没人接（还没挂上）或者拉失败返回 false */
export async function refetchRows(req: Partial<RowsRequest>): Promise<boolean> {
  if (!fetcher) return false;
  try {
    return await fetcher(req, true);
  } catch {
    return false;
  }
}

/** 自己存完的那几条路通用的：只拉这几行，拉不成就整页刷新（跟以前一样） */
export function refetchOrRefresh(req: Partial<RowsRequest>, refresh: () => void): Promise<boolean> {
  return refetchRows(req).then((ok) => {
    if (!ok) refresh();
    return ok;
  });
}

export function markMerged(orderIds: string[], at: number) {
  if (orderIds.length === 0) return;
  for (const id of orderIds) merged.set(id, Math.max(merged.get(id) ?? 0, at));
  listeners.forEach((l) => l());
}

export function mergedAt(): ReadonlyMap<string, number> {
  return merged;
}

/** 这一单手里的数据是服务端什么时候查的（整页渲染和单独拉回来的，取晚的那个） */
export function orderDataAt(orderId: string): number {
  const raw = document.querySelector<HTMLElement>("[data-rendered-at]")?.dataset.renderedAt;
  return Math.max(raw ? Number(raw) : 0, merged.get(orderId) ?? 0);
}

export function subscribeMerged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
