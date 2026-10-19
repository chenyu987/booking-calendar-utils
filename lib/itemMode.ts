// 排期总览标题旁边那个「全部 / Alpha / Beta」开关。
//
// 选了 Alpha：日历和顶上的统计只剩 Alpha 地点的单子，建单时地点名只提示 Alpha 的地点，
// 资源清单（含分配时的候选）只剩 alpha 资源。Beta 同理。
//
// 存 cookie，**每台电脑各记各的** —— 这是「我现在在做哪边的生意」，
// 一坐下来就是那一边，不该每换一个链接就丢。
//
// **判断不了的照样显示**：地点名没填 / 写错 / 重名说不清（requiredItem 返回 null）的单子、
// 类型没填的资源，两边都看得见。这批本来就标红等着人改，藏起来就没人改了 ——
// 跟 itemConflictReason 那句「判断不了就不拦」同一个取舍。
//
// 这只是「看哪边」，不是校验：类型对不上地点的分配由 assignBlockReason 在服务端拦，
// 跟开关切在哪无关。纯逻辑放 lib/（客户端组件和页面都 import 这一份）。

import { requiredItem, type ItemType } from "@/lib/locations";

export const ITEM_MODE_COOKIE = "item_mode";

/** "" = 全部 */
export type ItemMode = "" | ItemType;

export const ITEM_MODE_LABELS: Record<ItemMode, string> = {
  "": "全部",
  alpha: "Alpha",
  beta: "Beta",
};

/** cookie 是人能随便改的，不认识的值一律当「全部」 */
export function parseItemMode(raw: string | null | undefined): ItemMode {
  return raw === "alpha" || raw === "beta" ? raw : "";
}

/** 这一单在当前开关下显不显示 */
export function orderInItemMode(location: string | null | undefined, mode: ItemMode): boolean {
  if (!mode) return true;
  const need = requiredItem(location);
  return need === null || need === mode;
}

/** 这个资源在当前开关下显不显示 */
export function resourceInItemMode(itemType: string | null | undefined, mode: ItemMode): boolean {
  if (!mode) return true;
  if (itemType !== "beta" && itemType !== "alpha") return true;
  return itemType === mode;
}

/**
 * 建单时填的地点不是当前这一边的 → 一句话说为什么建不了；对得上（或判断不了）返回 null。
 * 不拦的话建出来的单当场就被开关藏起来，人会以为没建成
 */
export function itemModeLocationBlock(
  location: string | null | undefined,
  mode: ItemMode
): string | null {
  if (!mode) return null;
  const need = requiredItem(location);
  if (!need || need === mode) return null;
  return `${location?.trim()} 是 ${ITEM_MODE_LABELS[need]} 的地点，现在开关在 ${ITEM_MODE_LABELS[mode]}`;
}
