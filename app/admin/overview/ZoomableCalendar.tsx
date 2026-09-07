"use client";

import { useState } from "react";
import CalendarScroller from "./CalendarScroller";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

// 纯前端缩放，跟 Google Sheet 右下角调百分比一个作用：订单多的时候缩小看全局。
//
// 这个组件把顶部工具栏（统计数字 + 状态图例）和资源面板一起收下来当 props，
// 是为了把缩放下拉框塞进统计那一行——缩放状态在客户端，统计行是服务端渲染的，
// 两边要挤在同一行就必须由同一个客户端组件来渲染。这样缩放不再自己占一行，
// 下面整块往上移一行。传进来的还是 Server Component，只是当 children 用。
//
// 另外注意层级：滚动容器在 zoom 的**外面**。CSS zoom 会把里面所有尺寸一起缩，
// 放里面的话缩到 90% 时容器高度也跟着缩 10%，框就填不满屏幕了。
export default function ZoomableCalendar({
  toolbar,
  panel,
  children,
}: {
  toolbar: React.ReactNode;
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(100);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          margin: "8px 0 10px",
          flexWrap: "wrap",
        }}
      >
        {toolbar}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#888" }}>缩放</span>
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ fontSize: 12, padding: "2px 4px" }}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        {panel}
        <div style={{ flex: 1, minWidth: 0 }}>
          <CalendarScroller>
            <div style={{ zoom: `${zoom}%` }}>{children}</div>
          </CalendarScroller>
        </div>
      </div>
    </>
  );
}
