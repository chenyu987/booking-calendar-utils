// 亮色 / 暗色两套配色。
//
// 这个项目没有 UI 框架，样式全是内联的，颜色本来是几百处写死的十六进制。
// 要能换肤，唯一不改架构的办法就是：把颜色收成一组 CSS 变量，内联样式里写
// `var(--x)`，换肤只换变量的值。所以这个文件是**颜色的唯一出处**，
// 组件里不该再出现新的 #xxxxxx。
//
// 三种状态：
//   · 没选过 → 跟系统走（prefers-color-scheme）
//   · 选了 → data-theme="light" / "dark" 挂在 <html> 上，压过系统
// 选择存 cookie，服务端渲染时就把 data-theme 写进 <html>，
// 所以刷新不会先闪一下亮色再变暗。

export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** token → [亮色, 暗色] */
const TOKENS: Record<string, [string, string]> = {
  // —— 结构 ——
  "bg": ["#ffffff", "#15171c"],
  "surface": ["#ffffff", "#1d2027"],
  "surface-2": ["#fafafa", "#23262e"],
  "border": ["#e5e5e5", "#333844"],
  "border-strong": ["#cccccc", "#454b58"],

  // —— 文字 ——
  "text": ["#222222", "#e7e9ee"],
  "text-muted": ["#666666", "#a9aeba"],
  "text-faint": ["#888888", "#7e8492"],
  /** 实心按钮上的字，两边都是浅的 */
  "on-solid": ["#ffffff", "#ffffff"],
  "solid-bg": ["#111111", "#3f4655"],

  // —— 语义色 ——
  "danger": ["#c0392b", "#f2897b"],
  "ok": ["#1f5c33", "#7ed19a"],
  "warn": ["#a8620d", "#e3a961"],
  "link": ["#1c4e78", "#8ab8e6"],
  "peak": ["#5b3fa8", "#c0aef2"],

  // —— 订单状态（bg / border / text 三件套）——
  "st-created-bg": ["#f1f1f1", "#262a33"],
  "st-created-border": ["#d0d0d0", "#3d4350"],
  "st-created-text": ["#444444", "#a9aeba"],
  "st-assigned-bg": ["#e3f0fb", "#1b2b3d"],
  "st-assigned-border": ["#a9cdeb", "#2f4a68"],
  "st-assigned-text": ["#1c4e78", "#8ab8e6"],
  "st-pickup-bg": ["#fdf0dc", "#33291a"],
  "st-pickup-border": ["#e9c68a", "#5a462a"],
  "st-pickup-text": ["#7a5312", "#e0b169"],
  "st-payment-bg": ["#fbe9e7", "#33211f"],
  "st-payment-border": ["#eab3aa", "#5c3733"],
  "st-payment-text": ["#8a2f21", "#f0928a"],
  "st-complete-bg": ["#e6f4e9", "#1a2c20"],
  "st-complete-border": ["#a8d5b5", "#2f5340"],
  "st-complete-text": ["#1f5c33", "#7ed19a"],
  "st-cancelled-bg": ["#eeeeee", "#24272e"],
  "st-cancelled-border": ["#cccccc", "#3b404b"],
  "st-cancelled-text": ["#888888", "#7e8492"],
  "st-refunded-bg": ["#efe7f5", "#282132"],
  "st-refunded-border": ["#c9b0dc", "#4a3d5e"],
  "st-refunded-text": ["#5a3878", "#c0aef2"],

  // —— 日历上的底色 ——
  "weekend-bg": ["#fdefdb", "#2f2718"],
  "peak-bg": ["#e9e0fb", "#2b2440"],
  "peak-stripe": ["#f4efff", "#221d33"],
  "peak-hint": ["#a48ee0", "#6d5aa8"],
  "assigned-tint": ["#f2f9f4", "#1b2620"],
  "row-tint": ["#eef4fa", "#1e2530"],
  "notice-bg": ["#fdf3e3", "#2e2617"],
  "notice-border": ["#e9c893", "#5a482a"],
  "danger-soft-bg": ["#fff4e5", "#332a1a"],
  "danger-soft-border": ["#e0c0c0", "#54393a"],
  "scrollbar-thumb": ["0, 0, 0", "255, 255, 255"],
};

const vars = (i: 0 | 1) =>
  Object.entries(TOKENS)
    .map(([k, v]) => `--${k}:${v[i]}`)
    .join(";");

/**
 * 塞进 <head> 的那段 CSS。
 * 暗色写两遍是故意的：一遍给「跟系统走」，一遍给「手动选了暗色」。
 * `:not([data-theme="light"])` 保证手动选了亮色时系统的偏好不会又把它掰回去。
 */
export function themeCss(): string {
  return [
    `:root{color-scheme:light;${vars(0)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;${vars(1)}}}`,
    `:root[data-theme="dark"]{color-scheme:dark;${vars(1)}}`,
  ].join("");
}
