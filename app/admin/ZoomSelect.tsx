"use client";

import { useState } from "react";

// 日历的缩放下拉（排期总览、Match、Referral 三张日历共用一份）。
// 纯前端，跟 Google Sheet 右下角调百分比一个作用：订单多的时候缩小看全局；
// 手机上尤其要用 —— 100% 一屏只看得到两三天。
export const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

export function ZoomSelect({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>缩放</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ fontSize: 12, padding: "2px 4px" }}
      >
        {ZOOM_LEVELS.map((z) => (
          <option key={z} value={z}>
            {z}%
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * 给服务端渲染的日历套一层缩放：下拉在上面，滚动容器在 zoom 的**外面**
 * （跟排期总览一个层级 —— 放里面的话容器尺寸也跟着缩）。
 */
export function ZoomBox({ scrollStyle, children }: { scrollStyle: React.CSSProperties; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(100);
  return (
    <>
      <div style={{ margin: "0 0 8px" }}>
        <ZoomSelect value={zoom} onChange={setZoom} />
      </div>
      <div style={scrollStyle}>
        <div style={{ zoom: `${zoom}%` }}>{children}</div>
      </div>
    </>
  );
}
