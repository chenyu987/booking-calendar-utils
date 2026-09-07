"use client";

import { useState } from "react";

// 资源筛选条的收起/展开。
//
// 设计上最关键的一点：收起之后**不能把「当前正在筛选」这件事一起藏掉**。
// 不然筛掉一半资源之后收起来，过一会儿回来看只会觉得"我的资源怎么少了"。
// 所以收起态那一行会把生效中的条件摘要出来（比如 alpha · 男资源），旁边直接给「清除」。
//
// 没有任何筛选时收起态就只剩一个「筛选」按钮，占一行；展开才是完整表单。
// 默认收起——平时都是直接看资源列表，筛选是偶尔为之。
export default function CollapsibleFilters({
  initialCollapsed,
  hasFilter,
  summary,
  clearHref,
  children,
}: {
  initialCollapsed: boolean;
  hasFilter: boolean;
  summary: string;
  clearHref: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `resource_filters_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000`;
  }

  return (
    <div style={{ marginBottom: collapsed ? 8 : 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "展开筛选" : "收起筛选"}
          style={{
            fontSize: 12,
            lineHeight: 1,
            padding: "4px 8px",
            cursor: "pointer",
            border: "1px solid #ddd",
            borderRadius: 4,
            // 有筛选生效时按钮也高亮一下，收起状态下更容易注意到
            background: hasFilter ? "#fff4e5" : "#fafafa",
            color: hasFilter ? "#a8620d" : "#666",
            flexShrink: 0,
          }}
        >
          {collapsed ? "▾" : "▴"} 筛选
        </button>

        {/* 摘要只在收起时显示，展开的话表单本身就把条件写在脸上了 */}
        {collapsed && hasFilter && (
          <>
            <span
              title={summary}
              style={{
                fontSize: 12,
                color: "#a8620d",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {summary}
            </span>
            <a
              href={clearHref}
              style={{
                fontSize: 12,
                color: "#666",
                flexShrink: 0,
                textDecoration: "underline",
              }}
            >
              清除
            </a>
          </>
        )}
      </div>

      {!collapsed && children}
    </div>
  );
}
