"use client";

import { useState } from "react";
import CalendarScroller from "./CalendarScroller";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

// 纯前端缩放，跟 Google Sheet 右下角调百分比一个作用：订单多的时候缩小看全局。
//
// 注意层级顺序：滚动容器在 zoom 的**外面**。CSS zoom 会把里面所有尺寸一起缩，
// 之前把滚动容器放在里面，缩到 90% 时容器高度也跟着缩了 10%，框就填不满屏幕了。
// 现在容器是 1:1 的、永远铺满，只有里面的日历内容跟着缩放变大变小。
export default function ZoomableCalendar({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(100);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
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
      <CalendarScroller>
        <div style={{ zoom: `${zoom}%` }}>{children}</div>
      </CalendarScroller>
    </div>
  );
}
