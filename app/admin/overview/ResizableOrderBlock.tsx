"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorToast } from "./AssignActions";
import { resizeIndices } from "@/lib/dates";

// 分配模式下拖左右边框改订单的开始/结束日期，最短 1 天
export default function ResizableOrderBlock({
  orderId,
  orderStart,
  runStart,
  runEnd,
  startIndex,
  length,
  timeline,
  laneRow,
  style,
  children,
}: {
  orderId: string;
  orderStart: string;
  runStart: string;
  runEnd: string;
  startIndex: number;
  length: number;
  timeline: string[];
  laneRow: number;

  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const blockRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ edge: "start" | "end"; delta: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ edge: "start" | "end"; originX: number; colWidth: number } | null>(
    null
  );

  function beginDrag(edge: "start" | "end") {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // 缩放（CSS zoom）会整体缩放这个色块的渲染尺寸，但 clientX 和 colWidth 常量
      // 不会跟着变——直接拿常量除会在非 100% 缩放下算错格数。用色块自己此刻的实际
      // 渲染宽度除以它横跨的天数，反推出"现在"每格多宽，缩放到多少都对得上。
      const rect = blockRef.current!.getBoundingClientRect();
      const effectiveColWidth = rect.width / length;
      dragRef.current = { edge, originX: e.clientX, colWidth: effectiveColWidth };
      setDrag({ edge, delta: 0 });
      // 拖拽结束时浏览器会在鼠标松开处补一个 click，标记一下让"点外面退出"忽略这一下
      document.body.dataset.resizingOrder = "1";

      function onMove(ev: MouseEvent) {
        if (!dragRef.current) return;
        const delta = Math.round((ev.clientX - dragRef.current.originX) / dragRef.current.colWidth);
        setDrag({ edge: dragRef.current.edge, delta });
      }

      async function onUp(ev: MouseEvent) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!dragRef.current) return;
        const { edge, colWidth: dragColWidth } = dragRef.current;
        const delta = Math.round((ev.clientX - dragRef.current.originX) / dragColWidth);
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

        // 走 Route Handler 不走 Server Action：撞上「同一个资源同一天配两单」时
        // 要把「哪个资源、哪一天、撞了谁」原样说给人听，Server Action 抛的错在生产
        // 环境会被 Next 换成一句笼统的「服务器出错」
        try {
          const res = await fetch("/admin/overview/resize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: orderId,
              run_start: runStart,
              run_end: runEnd,
              new_start: newStart,
              new_end: newEnd,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "改日期没成功");
          router.refresh();
        } catch (e: any) {
          // 拖回原样 + 把原因说出来。不提示的话看起来就是「拖了没反应」，
          // 人会以为是资源了，反复再拖几次
          setDrag(null);
          setError(e.message ?? "改日期没成功");
        }
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
    <>
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}
    <div
      ref={blockRef}
      data-order-id={orderId}
      data-order-start={orderStart}
      style={{
        ...style,
        gridRow: laneRow,
        gridColumn: `${previewStart + 1} / span ${previewLength}`,
        position: "relative",
        zIndex: 1,
      }}
    >
      {children}
      {/* 左右两条 8px 的可拖区域，**故意没有可见的把手**。
          画一根竖杠会盖住色块最边上的字，而且只在编辑态出现 —— 进出编辑
          就多两根杠，正是「东西又动了」的一部分。边缘能拖记住就行。 */}
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
      />
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
      />
    </div>
    </>
  );
}
