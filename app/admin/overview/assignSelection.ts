import { useSyncExternalStore } from "react";

// 排期总览「现在选中的是哪一单」—— 给资源清单（ResourcePanel）看的。
//
// 两个来源：服务端渲染的 ?assign=<id>（页面传下来的），和 InstantAssign 点下去当场
// 选中的那一单（服务端那份还没回来）。后者优先：点了 B，左边就该当场换成 B 的资源，
// 不能还停在 A 上等一秒多。服务端那份接上以后 InstantAssign 把这里清掉，两个来源说的
// 是同一单，自然就接上了。
//
// 模块级一份，不放 React context：InstantAssign 和资源清单在树上隔得远（清单是
// ZoomableCalendar 的 panel 插槽），中间都是服务端组件，context 传不过去。

let instant: string | null = null;
const listeners = new Set<() => void>();

export function setInstantSelection(id: string | null) {
  if (instant === id) return;
  instant = id;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 现在选中的单：当场选的优先，没有就是服务端渲染的那一单 */
export function useAssignSelection(serverId: string | null): string | null {
  // 服务端渲染时没有「当场选的」，第三个参数给 null，hydration 不会对不上
  const v = useSyncExternalStore(subscribe, () => instant, () => null);
  return v ?? serverId;
}

// ── 资源清单和浮动条共用的那批数据 ───────────────────────────────────────────
// 每一单缺几个资源、每个资源排在哪几天、用资源历史 —— 资源清单（ResourcePanel）要，
// 当场画的浮动条（InstantAssign 里「打名字分配」的候选）也要。
// **只传一份**：两个组件各收一份 props 的话，RSC 会把它原样序列化两遍（不按引用去重，
// 2026-10-14 实测：每一单那份数据在页面里出现了两次，页面多了一两 MB）。
// 所以只传给 ResourcePanel，它在这儿登记一下，InstantAssign 点下去的时候来取。

export type SharedPanelData = {
  orders: Record<string, import("@/lib/assignPanel").PanelOrder>;
  allResources: any[];
  bookedDays: Record<string, string[]>;
  history: import("@/lib/recommend").PastUse[];
};

let shared: SharedPanelData | null = null;

/** ResourcePanel 每次渲染登记最新的一份。只在浏览器里记：服务端的模块变量是各个请求共用的 */
export function publishPanelData(d: SharedPanelData) {
  if (typeof window !== "undefined") shared = d;
}

export function getPanelData(): SharedPanelData | null {
  return shared;
}
