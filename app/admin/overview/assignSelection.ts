import { useSyncExternalStore } from "react";
import type { PendingPatch } from "./blockPatch";

// 排期总览：分配态（编辑一单）的客户端状态。**选中、退出、存都在浏览器里**（InstantAssign 管），
// 服务端永远只画普通态 —— 进出编辑态不回服务端，当场完成。
//
// 这里放几样要跨组件看的东西（模块级一份，不放 React context：InstantAssign、资源清单、
// 1800 个色块在树上隔得远，中间都是服务端组件，context 传不过去）：
//   - 现在选中的是哪一单（资源清单、色块的选中光圈、建单框选看它）
//   - 选中那一单的资源「上一次」用在哪几单（那几单亮一圈，lib/previousUse.ts）
//   - 退出时改过、还在后台存的字段（色块先显示新值，blockPatch.ts）
//   - 别的组件要求「退出编辑」（多选、删单）时找谁

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ── 选中哪一单 ───────────────────────────────────────────────────────────────
// undefined = 还没接管（刚打开页面、InstantAssign 还没挂上）：这时听服务端的 ?assign=；
// 接管以后 null 就是「没选」，不再回头看 URL 上那份（它可能是旧的）
let selected: string | null | undefined = undefined;

export function setInstantSelection(id: string | null) {
  if (selected === id) return;
  selected = id;
  emit();
}

export function getSelection(): string | null {
  return selected ?? null;
}

/** 现在选中的单。还没接管时退回服务端渲染的那一单 */
export function useAssignSelection(serverId: string | null): string | null {
  const v = useSyncExternalStore(subscribe, () => selected, () => undefined);
  return v === undefined ? serverId : v;
}

/** 这一单是不是选中的（色块用：1800 个色块各订阅一个布尔，只有变了的那两块重画） */
export function useIsSelected(orderId: string): boolean {
  return useSyncExternalStore(subscribe, () => selected === orderId, () => false);
}

// ── 「上一次」那几单 ─────────────────────────────────────────────────────────
let previousUse: ReadonlySet<string> = new Set();

export function setPreviousUse(ids: ReadonlySet<string>) {
  previousUse = ids;
  emit();
}

export function useIsPreviousUse(orderId: string): boolean {
  return useSyncExternalStore(subscribe, () => previousUse.has(orderId), () => false);
}

// ── 退出时改过、还在后台存的字段 ─────────────────────────────────────────────
let patches: ReadonlyMap<string, PendingPatch> = new Map();

export function getPatches() {
  return patches;
}

export function setPatches(next: ReadonlyMap<string, PendingPatch>) {
  patches = next;
  emit();
}

export function usePatch(orderId: string): PendingPatch | undefined {
  return useSyncExternalStore(subscribe, () => patches.get(orderId), () => undefined);
}

// ── 别的组件要求退出编辑 ─────────────────────────────────────────────────────
// 多选（BulkSelect）一选中多单就得退出分配态；删单要退出且**不存**（单子都没了）
export type ExitMode = "save" | "discard";
let exitHandler: ((mode: ExitMode) => void) | null = null;

export function registerExitHandler(fn: ((mode: ExitMode) => void) | null) {
  exitHandler = fn;
}

export function requestExit(mode: ExitMode) {
  exitHandler?.(mode);
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
  usesByResource: Record<string, import("@/lib/previousUse").ResourceUse[]>;
};

let shared: SharedPanelData | null = null;

/** ResourcePanel 每次渲染登记最新的一份。只在浏览器里记：服务端的模块变量是各个请求共用的 */
export function publishPanelData(d: SharedPanelData) {
  if (typeof window !== "undefined") shared = d;
}

export function getPanelData(): SharedPanelData | null {
  return shared;
}
