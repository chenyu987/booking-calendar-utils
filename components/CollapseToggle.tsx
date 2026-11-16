"use client";

// 左边导航、右边「对外页面」那两根拖动竖条上的小圆钮：点一下收起，再点一下展开。
//
// 两边原来就能收（左边拖到 0、右边双击），但竖条上什么提示都没有，看不出来 ——
// 这颗钮是让「能收起来」这件事看得见。拖动、双击照旧。
//
// 钮挂在竖条**里面**（absolute，竖条要 position:relative），横着骑在那根 1px 线上，
// 不额外占宽度。mousedown 要拦住：不然按下去先触发竖条的拖动。
/** 收起时竖条加宽到多少，正好放下这颗钮。两边竖条都从这里取 */
export const COLLAPSED_HANDLE_WIDTH = 20;

export default function CollapseToggle({
  collapsed,
  side,
  label,
  onToggle,
}: {
  collapsed: boolean;
  /** 这一栏在哪边：决定箭头朝哪（收起 = 朝这一栏所在的那边） */
  side: "left" | "right";
  /** 「导航」/「对外页面」，拼进提示里 */
  label: string;
  onToggle: () => void;
}) {
  const towardSide = side === "left" ? "‹" : "›";
  const awayFromSide = side === "left" ? "›" : "‹";
  return (
    <button
      type="button"
      aria-label={collapsed ? `展开${label}` : `收起${label}`}
      aria-expanded={!collapsed}
      title={collapsed ? `展开${label}` : `收起${label}`}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={onToggle}
      style={{
        position: "absolute",
        top: 12,
        // 开着：圆心骑在竖条那根线上（线在竖条左边缘）。
        // 收起：竖条会加宽到 COLLAPSED_HANDLE_WIDTH，钮整颗放在线右边那条空里 ——
        // 不然它要么出了屏幕（左边贴着窗口），要么压在页面内容上（标题、表格最右一列）
        left: collapsed ? 1 : -9,
        zIndex: 20,
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-muted)",
        fontSize: 13,
        lineHeight: "15px",
        cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,.08)",
      }}
    >
      {collapsed ? awayFromSide : towardSide}
    </button>
  );
}
