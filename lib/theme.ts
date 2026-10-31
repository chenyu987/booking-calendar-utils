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
export const TOKENS: Record<string, [string, string]> = {
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
  // 待处理是**起点**，量最大，而且它本身不代表「有事要办」，所以底色要淡、
  // 要往背景里退，让有颜色的那几个状态去抓眼睛。
  // 但**不能真透明** —— 全透之后色块只剩一圈描边，在白底上糊成一片，
  // 看不出「这儿有一单」。取原来的 #f1f1f1 和纯白之间那一档：
  // 灰还在，只是压到最轻。
  "st-created-bg": ["#f6f6f7", "#20232c"],
  "st-created-border": ["#d0d0d0", "#3d4350"],
  "st-created-text": ["#444444", "#a9aeba"],
  "st-assigned-bg": ["#e3f0fb", "#1b2b3d"],
  "st-assigned-border": ["#a9cdeb", "#2f4a68"],
  "st-assigned-text": ["#1c4e78", "#8ab8e6"],
  "st-pickup-bg": ["#fdf0dc", "#33291a"],
  "st-pickup-border": ["#e9c68a", "#5a462a"],
  "st-pickup-text": ["#7a5312", "#e0b169"],
  "st-payment-bg": ["#efe7f5", "#282132"],
  "st-payment-border": ["#c9b0dc", "#4a3d5e"],
  "st-payment-text": ["#5a3878", "#c0aef2"],
  "st-complete-bg": ["#e6f4e9", "#1a2c20"],
  "st-complete-border": ["#a8d5b5", "#2f5340"],
  "st-complete-text": ["#1f5c33", "#7ed19a"],
  // 未确认：正橙。夹在待取资源的金（~36°）和需退款的珊瑚红（~11°）中间，
  // 是这一套里最挤的一段色相，所以**底色也得拉开**，不能只靠描边 ——
  // 待取资源的底是奶油白 (#fdf0dc)，这里给到明确的蜜桃橙 (#fce4d0)，
  // 一眼能分出是两块颜色，而不是同一块的深浅。
  "st-unconfirmed-bg": ["#fce4d0", "#35210f"],
  "st-unconfirmed-border": ["#f4a765", "#6d451d"],
  "st-unconfirmed-text": ["#8f4200", "#f5a558"],
  // 已取消跟待处理都是灰的，原来两档挨得太近（#eeeeee vs #f6f6f7，描边
  // #cccccc vs #d0d0d0），并排看几乎分不出。这里把已取消整体压深一档：
  // 待处理是「几乎看不见的一层灰」，已取消是「实实在在盖了一层灰」，
  // 像盖了个戳。暗色那边同理，往亮里推（暗底上「更灰」= 更亮的中性灰）。
  "st-cancelled-bg": ["#e2e2e5", "#2c2f38"],
  "st-cancelled-border": ["#b5b5ba", "#4a4f5c"],
  "st-cancelled-text": ["#5e5e66", "#9aa0ac"],
  // 需退款拿珊瑚红、待付款拿紫（跟原来对调过）：这一整套里红是最扎眼的一档，
  // 给「欠着一笔钱没退」比给「等着收钱」更该抢眼 —— 前者是我们欠人的。
  "st-needrefund-bg": ["#fbe9e7", "#33211f"],
  "st-needrefund-border": ["#eab3aa", "#5c3733"],
  "st-needrefund-text": ["#8a2f21", "#f0928a"],

  // —— 日历上的底色 ——
  "weekend-bg": ["#fdefdb", "#2f2718"],
  "peak-bg": ["#e9e0fb", "#2b2440"],
  "peak-stripe": ["#f4efff", "#221d33"],
  "peak-hint": ["#a48ee0", "#6d5aa8"],
  "assigned-tint": ["#f2f9f4", "#1b2620"],
  "row-tint": ["#eef4fa", "#1e2530"],
  /** 分配时点亮「这几个资源上一单在哪儿」的那圈光 */
  "prev-use": ["#e2a03f", "#c9922f"],

  // —— 管理员（排期总览色块的边框）——
  // 只有**非主要管理员**的单才上色（主要管理员 = 大多数单子，保持原样），见 lib/orderFrame.ts。
  // 按管理员加入的先后轮着取。**避开了已经有含义的颜色**：蓝（选中 / 链接）、
  // 琥珀（--prev-use「上一单在这儿」）、紫（peak 日）、红（冲突 / 危险），
  // 以及订单状态底色那几个色系 —— 边框跟它们撞了就读不出是哪个意思
  // 颜色压过饱和度、往底色那边靠（2026-10-08：原来的洋红太扎眼），只要看得出「这块不一样」就够
  "admin-1": ["#d48aaf", "#a9708f"],
  "admin-2": ["#6fb0a6", "#4e8f86"],
  "admin-3": ["#c4a07a", "#9a7b5a"],
  "admin-4": ["#8d97a8", "#7a8496"],
  // 同一个色系的浅底 + 深字，给「谁的客人」那个小标签用（lib/orderFrame.ts 的 adminTagColors）。
  // 底色压得很浅（标签挤在表格里，深了一列全是色块），字往深里压，保证认得出字
  "admin-1-tint": ["#fbeaf2", "#3a2531"],
  "admin-1-ink": ["#a8456f", "#e3a6c2"],
  "admin-2-tint": ["#e6f3f1", "#1f3230"],
  "admin-2-ink": ["#3b7a71", "#8fcbc2"],
  "admin-3-tint": ["#f6eee4", "#33291f"],
  "admin-3-ink": ["#86613a", "#d4b48f"],
  "admin-4-tint": ["#eceef2", "#272b33"],
  "admin-4-ink": ["#55607a", "#aab3c4"],
  /** Beta 地点的单子的边框（不分管理员，压过上面那几个），见 lib/orderFrame.ts 的 frameColor。
   *  比管理员那几个饱和：满屏 Alpha 单里要一眼挑出 Beta 的。青色避开了蓝（选中）和 admin-2 的灰绿 */
  "beta": ["#14a7c0", "#33b9cf"],
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
