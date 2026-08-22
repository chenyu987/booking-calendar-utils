// admin 侧边栏宽度的默认值和上下限。
//
// 为什么单独放 lib：宽度既要在服务端用（layout 读 cookie 算初始宽度），
// 又要在客户端用（拖拽时钳制）。不能把这些常量放进那个 "use client" 组件再让
// layout 去 import —— Server Component 从客户端模块里 import 出来的是客户端引用，
// 在服务端调用会炸。

export const DEFAULT_NAV_WIDTH = 160;
export const MIN_NAV_WIDTH = 0;
export const MAX_NAV_WIDTH = 400;

// 导航内容自身的宽度，比默认宽度窄 32（左右各 16 的内边距）。
// 侧边栏被拖到比这还窄时，文字直接被裁掉而不是换行——换行会把整个布局撑变形。
export const NAV_CONTENT_WIDTH = DEFAULT_NAV_WIDTH - 32;

export function clampNavWidth(px: number): number {
  return Math.min(MAX_NAV_WIDTH, Math.max(MIN_NAV_WIDTH, Math.round(px)));
}

// cookie 里存的是个像素数字字符串，但 cookie 是用户可改的，什么脏值都可能进来，
// 解析不出来就退回默认宽度。注意 0 是合法值（完全收起），不能用 falsy 判断。
export function parseNavWidth(raw: string | undefined | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_NAV_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_NAV_WIDTH;
  return clampNavWidth(n);
}
