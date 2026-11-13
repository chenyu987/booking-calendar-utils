"use client";

import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "@/lib/adminMobile";

// 资源面板的外壳，带一个收起/展开的按钮。
// 收起之后只剩一根窄条（按钮还在，能再展开），右边日历就把腾出来的 260px 吃掉。
//
// 状态存 cookie，跟侧边栏宽度一个套路（见 ResizableNav）：服务端渲染时读出来当
// 初始值，所以跳页面不会丢、首屏也不会闪一下再收起。不走 Server Action——
// 收起纯粹是界面状态，绕服务端等于每点一次都重渲染整棵树。
//
// id 必须留在最外层：InstantAssign 靠 #resource-panel 判断"点在面板里
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

  // 手机上展开的面板会盖住日历，所以手机上**没自己选过**就默认收起。
  // 选过（cookie 里有值）就照用户的来。只在挂载时看一次，不跟着窗口宽度来回变
  useEffect(() => {
    const chosen = document.cookie.split("; ").some((c) => c.startsWith("resource_panel_collapsed="));
    if (!chosen && window.matchMedia(`(max-width:${MOBILE_BREAKPOINT}px)`).matches) setCollapsed(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `resource_panel_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000`;
  }

  return (
    // data-expanded：手机上展开时它浮在日历上面（lib/adminMobile.ts），不然 260px 宽的面板
    // 把 390px 的屏占掉大半，日历只剩一条缝。桌面上这个属性没有规则命中
    <aside
      id="resource-panel"
      data-expanded={collapsed ? undefined : ""}
      style={{
        width: collapsed ? 14 : expandedWidth,
        // 跟日历之间的间距由这儿控制（外层 flex 的 gap 设成 0 了）：
        // 收起之后只留一点点，那 20px 全让给日历
        marginRight: collapsed ? 4 : 20,
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
            width: 14,
            padding: "6px 0",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--surface-2)",
            color: "var(--text-muted)",
          }}
        >
          ›
        </button>
      ) : (
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {/* 绝对定位贴右上角，跟「资源 Resource（N）」那行标题并排。
              单独占一行的话左边一大片是空的，白白浪费一行高度 */}
          <button
            type="button"
            onClick={toggle}
            title="收起资源面板"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              zIndex: 1,
              fontSize: 12,
              lineHeight: 1,
              padding: "2px 6px",
              cursor: "pointer",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            ‹ 收起
          </button>
          {children}
        </div>
      )}
    </aside>
  );
}
