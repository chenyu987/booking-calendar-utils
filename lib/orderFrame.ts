import type { Admin } from "@/lib/admins";
import { requiredItem } from "@/lib/locations";

// 排期总览一个色块的**边框和光圈**：唯一出处。
//
// 普通态（page.tsx 的 blockStyle）和选中态（ResizableOrderBlock）都从这里取 ——
// CLAUDE.md「进出编辑态，几何必须一模一样」：两边各写一份，改了一边忘了另一边，
// 一进编辑所有东西错开几像素。所以**边框永远是 1px**，加粗一律走 box-shadow（不参与布局）。
//
// 这一格同时要表达三件事，各走各的通道，互不覆盖：
//   - 订单状态 → 底色 + 同色系的细边（statusBorder）
//   - Beta 的单 → 边框一律 --beta（2026-10-16 定的：是谁建的不重要，Beta 的单都一个颜色），
//     压过管理员的颜色。走的是同一个通道（frameColor），所以选中时照样加重
//   - 是哪个管理员的 → **只有非主要管理员才上色**：只把 1px 边框换成他的颜色（柔和色）。
//     主要管理员（大多数单子都是他的）保持原样 —— 满屏只有少数单子带颜色，
//     一眼就分得出哪些不是他的。原来还往里叠一层同色细线、看着像 2px，太扎眼（2026-10-08 去掉）
//   - 选中（正在分配这一单）→ 外面一圈蓝光。管理员颜色在选中时**再加重**（往里叠一层），
//     不被蓝色盖掉
//   - 「这几个资源上一单在哪儿」→ 外面一圈琥珀光（跟选中互斥）

/**
 * 这一单实际算谁的：写了就是写的那个，**没写就算主要管理员的**（2026-10-06 定的：
 * 大多数单子都是主要管理员做的，以前的单不补，现算）。主要管理员也没设的话就是 null
 */
export function effectiveAdminId(orderAdminId: string | null | undefined, primaryId: string | null): string | null {
  return orderAdminId || primaryId || null;
}

const ADMIN_COLOR_COUNT = 4;

/**
 * 这个管理员的色块边框用什么颜色。主要管理员、或者算不出是谁的 → null（保持原样）。
 * 其余按加入的先后（admins 的顺序，主要管理员不占位）轮着取 --admin-1..4 ——
 * **算出来的，不存字段**：admins 不给删，顺序就不会变，颜色也就不会跳
 */
export function adminColor(adminId: string | null, admins: Admin[], primaryId: string | null): string | null {
  if (!adminId || adminId === primaryId) return null;
  const others = admins.filter((a) => a.id !== primaryId);
  const i = others.findIndex((a) => a.id === adminId);
  if (i === -1) return null;
  return `var(--admin-${(i % ADMIN_COLOR_COUNT) + 1})`;
}

/** Beta 单子的边框色。token 在 lib/theme.ts */
export const BETA_FRAME_COLOR = "var(--beta)";

/**
 * 色块边框换成什么颜色：Beta 地点的单 → BETA_FRAME_COLOR，不看是谁的；
 * 其余照旧按管理员（adminColor）。都不用换 → null。
 * 地点认不出来的（requiredItem 是 null）不算 Beta，走管理员那条
 */
export function frameColor(
  location: string | null | undefined,
  adminId: string | null,
  admins: Admin[],
  primaryId: string | null
): string | null {
  if (requiredItem(location) === "beta") return BETA_FRAME_COLOR;
  return adminColor(adminId, admins, primaryId);
}

export function orderFrame({
  statusBorder,
  adminColor,
  assigning,
  previousUse = false,
}: {
  statusBorder: string;
  adminColor: string | null;
  assigning: boolean;
  previousUse?: boolean;
}): { border: string; boxShadow: string | undefined } {
  const inner = adminColor && assigning ? `inset 0 0 0 1px ${adminColor}` : null;
  const outer = assigning
    ? "0 0 0 1px var(--link)"
    : previousUse
      ? "0 0 0 2px var(--prev-use)"
      : null;
  const shadows = [inner, outer].filter(Boolean);
  return {
    // 永远 1px：粗细一变，整块内容就往里挤，进出选中所有字都跳一下
    border: `1px solid ${adminColor ?? (assigning ? "var(--link)" : statusBorder)}`,
    boxShadow: shadows.length ? shadows.join(", ") : undefined,
  };
}
