// 物主那一页「日历 / 列表」这个开关。
//
// **为什么在 lib 而不是在组件旁边**：DemandBoard 现在是客户端组件（换资源、切视图
// 要当场生效，见那个文件开头），而 `"use client"` 模块导出的函数在服务端拿到的
// 是个客户端引用、不是函数本身 —— 服务端页面调它会当场炸（真炸过一次：
// `parseView is not a function`）。纯逻辑放 lib，两边 import 同一份。

export type DemandView = "calendar" | "list";

/** 默认日历。URL 里只出现非默认的那个（`?view=list`），跟这一页别的开关一个路子 */
export function parseView(value: string | undefined): DemandView {
  return value === "list" ? "list" : "calendar";
}

/**
 * 物主的显示偏好存在 cookie 里（不是库里 —— 见 app/provider/data.ts 那段为什么）。
 *
 * **名字放这儿是因为客户端也要写它**：设置那两个输入框直接 `document.cookie` 写完
 * `router.refresh()`，跟 ThemeToggle 一个路子。而 data.ts 带着 `next/headers`，
 * 客户端组件 import 不得。
 */
export const VIEW_COOKIES = {
  bandDays: "provider_band_days",
  start: "provider_start",
} as const;
