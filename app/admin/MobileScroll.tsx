import type { CSSProperties, ReactNode } from "react";

// 手机上（≤768px）把一张宽表格圈起来，在这个框里左右滑，表格保持 minWidth 那么宽，
// 不被挤成一个字一列；表格上面的标题、表单照常按屏宽排。
// 桌面上两层 div 什么规则都不命中，跟没包一样。样式在 lib/adminMobile.ts（.m-scroll）。
// 不是 "use client"：服务端页面直接用。
export default function MobileScroll({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <div className="m-scroll">
      <div className="m-scroll-inner" style={{ "--m-min": `${minWidth}px` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
