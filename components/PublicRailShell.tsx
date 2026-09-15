import { RAIL_WIDTH } from "@/lib/bandDays";
import PublicLinkCards from "./PublicLinkCards";

// 「对外页面」那道帘子的**外壳**：手柄 + 可裁切的外框 + 定宽内容。
//
// **两处共用一份，不是各写各的。** 排期总览那道兼着「改每行几天」，其它 admin 页
// 那道只会拉宽拉窄 —— 拖的行为不一样，但**长什么样、多宽、留多少边距必须一模一样**。
// 之前各写了一份，结果一边 `marginLeft:12`、一边 `padding-left:10 + border-box`，
// 同一个宽度值画出来的内容宽度差了 10px，拉出来的长度就不一样了。
// CLAUDE.md：第二份数字和第二份样式是同一个 bug。
export default function PublicRailShell({
  width,
  dragging,
  headerText,
  headerHighlighted,
  title,
  onMouseDown,
  onDoubleClick,
}: {
  width: number;
  dragging: boolean;
  /** 总览改天数时这行临时变成读数，别的时候就是「对外页面」 */
  headerText: string;
  headerHighlighted?: boolean;
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <>
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title={title}
        style={{
          width: 5,
          flexShrink: 0,
          cursor: "col-resize",
          borderLeft: `1px solid ${dragging ? "var(--text-faint)" : "var(--border)"}`,
        }}
      />
      <aside
        style={{
          width,
          flexShrink: 0,
          marginLeft: width > 0 ? 12 : 0,
          // 内容定宽、外壳裁切：拖窄时卡片是被切掉而不是换行，
          // 换行会把这一栏撑得老高（跟侧边栏一个做法）
          overflow: "hidden",
        }}
      >
        <div style={{ width: RAIL_WIDTH }}>
          <div
            style={{
              fontSize: 12,
              color: headerHighlighted ? "var(--text)" : "var(--text-faint)",
              fontWeight: 500,
              margin: "8px 0 10px",
              lineHeight: "20px",
              whiteSpace: "nowrap",
            }}
          >
            {headerText}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PublicLinkCards />
          </div>
        </div>
      </aside>
    </>
  );
}
