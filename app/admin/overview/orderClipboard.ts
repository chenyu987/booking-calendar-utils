import { useSyncExternalStore } from "react";

// 排期总览复制 / 剪切 / 粘贴一单（像 Excel）：点一单 Ctrl/⌘+C（或 X）记下来，点空格子（或者鼠标停在空格子上）
// Ctrl/⌘+V。复制 = 同一单再建一份贴到那天开头（paste-order/route.ts，抄什么不抄什么见那边）；
// 剪切 = 把这一单挪到那天开头（move/route.ts，跟按住色块拖过去同一条路、同一套分配校验）。
// 贴完就放下，要再贴得再按一次。
//
// 「剪贴板」是模块级的一份，不进系统剪贴板：复制的是「哪一单」，不是一段文字；
// 也不进 URL / cookie —— 刷新就没了，跟 Excel 关了文件一样，无所谓。
// 复制在 InstantAssign（它知道选中的是哪单），粘贴在 NewOrderSelector（它知道格子是哪天），
// 两边隔着服务端组件，所以放这儿。

export type CopiedOrder = {
  orderId: string;
  /** 复制还是剪切 */
  mode: "copy" | "cut";
  /** 这一单现在的第一天：剪切贴过去时告诉 move「从哪天挪到哪天」 */
  firstDay: string;
  /** 「客人 · 地点」：贴的时候占位块上写它 */
  label: string;
  /** 地点：贴完看要不要清掉区域 / 地点筛选（新单被自己的筛选藏起来就像没贴上） */
  location: string;
  /** 第一天到最后一天差几天：占位块画多长。真日子由服务端按库里的算 */
  span: number;
};

let copied: CopiedOrder | null = null;
const listeners = new Set<() => void>();

export function setCopiedOrder(v: CopiedOrder | null) {
  copied = v;
  listeners.forEach((l) => l());
}

export function getCopiedOrder(): CopiedOrder | null {
  return copied;
}

export function useCopiedOrder(): CopiedOrder | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => copied,
    () => null
  );
}

/**
 * 这一下 Ctrl+C / Ctrl+V 该不该归我们：光标在输入框里、或者选中了一段字，是在复制粘贴文字，别抢
 */
export function isTextClipboardTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || el.matches("input, textarea, select"))) return true;
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== "";
}

export function isCopyKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c";
}

export function isCutKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "x";
}

export function isPasteKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "v";
}

// 鼠标最后停在哪儿：粘贴时没框选格子，就贴在鼠标底下那一格（点一下空白先退出分配态，
// 不用再点第二下框选）。只在浏览器里记，一个 document 级的监听，装一次
let pointer: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  document.addEventListener("mousemove", (e) => (pointer = { x: e.clientX, y: e.clientY }), { passive: true });
}

export function lastPointer() {
  return pointer;
}
