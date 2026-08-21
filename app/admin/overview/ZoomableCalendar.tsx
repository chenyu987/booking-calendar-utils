"use client";

import { useState } from "react";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

// 纯前端缩放，跟 Google Sheet 右下角调百分比一个作用：订单多的时候缩小看全局
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
      <div style={{ zoom: `${zoom}%` }}>{children}</div>
    </div>
  );
}
