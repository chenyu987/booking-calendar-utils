"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resizeIndices } from "@/lib/dates";

// 分配模式下拖左右边框改订单的开始/结束日期，最短 1 天
export default function ResizableOrderBlock({
  orderId,
  runStart,
  runEnd,
  startIndex,
  length,
  timeline,
  laneRow,
  colWidth,
  resizeAction,
  style,
  children,
}: {
  orderId: string;
  runStart: string;
  runEnd: string;
  startIndex: number;
  length: number;
  timeline: string[];
  laneRow: number;
  colWidth: number;
  resizeAction: (formData: FormData) => Promise<void>;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [drag, setDrag] = useState<{ edge: "start" | "end"; delta: number } | null>(null);
  const dragRef = useRef<{ edge: "start" | "end"; originX: number } | null>(null);

  function beginDrag(edge: "start" | "end") {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { edge, originX: e.clientX };
      setDrag({ edge, delta: 0 });
      // 拖拽结束时浏览器会在鼠标松开处补一个 click，标记一下让"点外面退出"忽略这一下
      document.body.dataset.resizingOrder = "1";

      function onMove(ev: MouseEvent) {
        if (!dragRef.current) return;
        const delta = Math.round((ev.clientX - dragRef.current.originX) / colWidth);
        setDrag({ edge: dragRef.current.edge, delta });
      }

      async function onUp(ev: MouseEvent) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!dragRef.current) return;
        const { edge } = dragRef.current;
        const delta = Math.round((ev.clientX - dragRef.current.originX) / colWidth);
        dragRef.current = null;
        setDrag(null);
        // click 事件跟 mouseup 同步派发，下一轮宏任务再摘掉标记，这样"点外面退出"能读到它
        setTimeout(() => {
          delete document.body.dataset.resizingOrder;
        }, 0);
        if (delta === 0) return;

        const { newStartIdx, newEndIdx } = resizeIndices(
          startIndex,
          length,
          timeline.length,
          edge,
          delta
        );
        const newStart = timeline[newStartIdx];
        const newEnd = timeline[newEndIdx];
        if (newStart === runStart && newEnd === runEnd) return;

        const fd = new FormData();
        fd.set("order_id", orderId);
        fd.set("run_start", runStart);
        fd.set("run_end", runEnd);
        fd.set("new_start", newStart);
        fd.set("new_end", newEnd);
        await resizeAction(fd);
        router.refresh();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }

  // 拖拽预览：按天对齐，直接挪 gridColumn，贴合日历本来的整天颗粒度
  let previewStart = startIndex;
  let previewLength = length;
  if (drag) {
    if (drag.edge === "start") {
      const s = Math.min(Math.max(startIndex + drag.delta, 0), startIndex + length - 1);
      previewStart = s;
      previewLength = startIndex + length - s;
    } else {
      const e = Math.max(Math.min(startIndex + length - 1 + drag.delta, timeline.length - 1), startIndex);
      previewLength = e - startIndex + 1;
    }
  }

  return (
    <div
      style={{
        ...style,
        gridRow: laneRow,
        gridColumn: `${previewStart + 1} / span ${previewLength}`,
        position: "relative",
        zIndex: 1,
      }}
    >
      {children}
      <div
        onMouseDown={beginDrag("start")}
        title="拖动改开始日期"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "ew-resize",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 3,
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 20,
            borderRadius: 1,
            background: "rgba(0,0,0,0.25)",
          }}
        />
      </div>
      <div
        onMouseDown={beginDrag("end")}
        title="拖动改结束日期"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "ew-resize",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 3,
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 20,
            borderRadius: 1,
            background: "rgba(0,0,0,0.25)",
          }}
        />
      </div>
    </div>
  );
}
