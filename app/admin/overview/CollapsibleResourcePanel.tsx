"use client";

import { useState } from "react";

// 资源面板的外壳，带一个收起/展开的按钮。
// 收起之后只剩一根窄条（按钮还在，能再展开），右边日历就把腾出来的 260px 吃掉。
//
// 状态存 cookie，跟侧边栏宽度一个套路（见 ResizableNav）：服务端渲染时读出来当
// 初始值，所以跳页面不会丢、首屏也不会闪一下再收起。不走 Server Action——
// 收起纯粹是界面状态，绕服务端等于每点一次都重渲染整棵树。
//
// id 必须留在最外层：ClickOutsideDeselect 靠 #resource-panel 判断"点在面板里
// 不算点到外面"，不然点筛选、点收起按钮都会把分配模式弹出去。
export default function CollapsibleResourcePanel({
  initialCollapsed,
  expandedWidth,
  children,
}: {
  initialCollapsed: boolean;
  expandedWidth: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `resource_panel_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000`;
  }

  return (
    <aside
      id="resource-panel"
      style={{
        width: collapsed ? 16 : expandedWidth,
        // 跟日历之间的间距由这儿控制（外层 flex 的 gap 设成 0 了）：
        // 收起之后只留一点点，那 20px 全让给日历
        marginRight: collapsed ? 6 : 20,
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 4,
      }}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          title="展开资源面板"
          style={{
            width: 16,
            padding: "6px 0",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            border: "1px solid #ddd",
            borderRadius: 4,
            background: "#fafafa",
            color: "#666",
          }}
        >
          ›
        </button>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              marginBottom: 2,
            }}
          >
            <button
              type="button"
              onClick={toggle}
              title="收起资源面板"
              style={{
                fontSize: 12,
                lineHeight: 1,
                padding: "2px 6px",
                cursor: "pointer",
                border: "1px solid #ddd",
                borderRadius: 4,
                background: "#fafafa",
                color: "#666",
              }}
            >
              ‹ 收起
            </button>
          </div>
          {children}
        </div>
      )}
    </aside>
  );
}
