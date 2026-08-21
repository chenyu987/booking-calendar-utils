"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { shortLabel } from "@/lib/dates";
import { computeTotalFromPerDay } from "@/lib/pricing";

const GAP = 2;
const POPUP_WIDTH = 260;
const POPUP_EST_HEIGHT = 300;

type Selection = { start: number; end: number; row: number };

// 空白区域拖出一段日期（像 Excel 拖单元格），双击打开小窗建新单
export default function NewOrderSelector({
  timeline,
  colWidth,
  rowHeight,
  laneCount,
  assigningOrderId,
  createOrderAction,
}: {
  timeline: string[];
  colWidth: number;
  rowHeight: number;
  laneCount: number;
  assigningOrderId: string | null;
  createOrderAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startIdx: number; row: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [location, setLocation] = useState("");
  const [perDayPrice, setPerDayPrice] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [error, setError] = useState("");

  function resetAll() {
    setPopupOpen(false);
    setSelection(null);
    setPopupPos(null);
    setName("");
    setMale(0);
    setFemale(0);
    setLocation("");
    setPerDayPrice("");
    setTotalPrice("");
    setError("");
  }

  // 点了别的订单（或者退出了分配模式），之前拖出来的框就当没发生过
  useEffect(() => {
    resetAll();
  }, [assigningOrderId]);

  // 弹窗开着的时候点弹窗以外的任何地方，效果跟点"取消"一样
  useEffect(() => {
    if (!popupOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-new-order-popup="true"]')) return;
      resetAll();
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [popupOpen]);

  // 选着的时候按 Esc 退出选择
  useEffect(() => {
    if (!selection) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") resetAll();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  // 点在选框所在的这个网格容器之外（比如页面标题、侧边栏），效果跟按 Esc 一样直接取消选择。
  // 容器内部的"点外面取消"已经在 handleMouseDown 里处理了，这里只管容器范围以外的点击。
  // 弹窗开着的时候不装这个监听：原生 datalist 下拉选项点击时 target 有时候不落在弹窗 DOM 里，
  // 会被误判成"点了外面"，把正在填的表单关掉。
  useEffect(() => {
    if (!selection || popupOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      if (target.closest('[data-new-order-popup="true"]')) return;
      resetAll();
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selection, popupOpen]);

  // 弹窗位置在挂载之后按视口尺寸算，避免跟渲染时机的 window 尺寸读数赛跑；
  // 优先放选框右下方，放不下就翻到上面/左边，保证整个窗口都在可视区里
  useLayoutEffect(() => {
    if (!popupOpen || !selection || !containerRef.current) {
      setPopupPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const rowTop = rect.top + selection.row * (rowHeight + GAP);
    const dayLeft = rect.left + Math.min(selection.start, selection.end) * (colWidth + GAP);

    const belowY = rowTop + rowHeight + 4;
    const spaceBelow = window.innerHeight - belowY;
    const top =
      spaceBelow >= POPUP_EST_HEIGHT ? belowY : Math.max(rowTop - POPUP_EST_HEIGHT - 4, 8);
    const left = Math.max(8, Math.min(dayLeft, window.innerWidth - POPUP_WIDTH - 8));
    setPopupPos({ top, left });
  }, [popupOpen, selection, rowHeight, colWidth]);

  function dayIndexAt(clientX: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.floor(x / (colWidth + GAP));
    return Math.min(Math.max(idx, 0), timeline.length - 1);
  }

  function rowIndexAt(clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.floor(y / (rowHeight + GAP));
    return Math.min(Math.max(idx, 0), laneCount - 1);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (popupOpen) return;
    // 现在还有另一张单子在分配模式里：这一下点击只负责把它点掉（ClickOutsideDeselect 管），
    // 不在这个位置立刻开新选框。松手之后分配模式退出了，下一次点击才真正开始拖新选框。
    if (assigningOrderId) return;
    const idx = dayIndexAt(e.clientX);
    const row = rowIndexAt(e.clientY);

    if (selection) {
      const lo = Math.min(selection.start, selection.end);
      const hi = Math.max(selection.start, selection.end);
      // 点在已选范围里：留着不动，等双击打开小窗
      if (row === selection.row && idx >= lo && idx <= hi) return;
      // 点在外面：取消这次选择，这次点击不再重新拖一个新的
      setSelection(null);
      return;
    }

    dragRef.current = { startIdx: idx, row };
    setSelection({ start: idx, end: idx, row });

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setSelection({ start: dragRef.current.startIdx, end: dayIndexAt(ev.clientX), row: dragRef.current.row });
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (assigningOrderId) return;
    if (!selection) {
      const idx = dayIndexAt(e.clientX);
      const row = rowIndexAt(e.clientY);
      setSelection({ start: idx, end: idx, row });
    }
    setPopupOpen(true);
  }

  // 弹窗里改了日期范围（天数变了），已经填过的每天单价要跟着重新算一次总价
  useEffect(() => {
    if (!selection || perDayPrice.trim() === "") return;
    const rate = Number(perDayPrice);
    if (!Number.isFinite(rate)) return;
    const days = Math.abs(selection.end - selection.start) + 1;
    const partySize = (male || 0) + (female || 0);
    setTotalPrice(String(computeTotalFromPerDay(rate, days, partySize)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // 填每天单价的时候顺手把总价算出来（单价 × 天数 × 人数），总价框自己也能再改
  function handlePerDayChange(value: string) {
    setPerDayPrice(value);
    const rate = Number(value);
    if (value.trim() === "" || !Number.isFinite(rate)) return;
    if (!selection) return;
    const days = Math.abs(selection.end - selection.start) + 1;
    const partySize = (male || 0) + (female || 0);
    setTotalPrice(String(computeTotalFromPerDay(rate, days, partySize)));
  }

  async function submit() {
    if (!selection || !name.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const lo = Math.min(selection.start, selection.end);
    const hi = Math.max(selection.start, selection.end);
    const days = timeline.slice(lo, hi + 1);

    const fd = new FormData();
    fd.set("customer_name", name.trim());
    fd.set("location", location.trim());
    fd.set("male_count", String(male || 0));
    fd.set("female_count", String(female || 0));
    fd.set("demand_days", JSON.stringify(days));
    fd.set("amount", totalPrice.trim());

    try {
      await createOrderAction(fd);
      resetAll();
      router.refresh();
    } catch {
      // 建单失败（比如网络中断）：把状态退回去，让用户能重新点"创建"，而不是卡在"建单中…"
      setSubmitting(false);
      setError("建单失败，请重试");
    }
  }

  if (timeline.length === 0) return null;

  const lo = selection ? Math.min(selection.start, selection.end) : 0;
  const hi = selection ? Math.max(selection.start, selection.end) : 0;
  const left = lo * (colWidth + GAP);
  const width = (hi - lo + 1) * colWidth + (hi - lo) * GAP;
  const top = selection ? selection.row * (rowHeight + GAP) : 0;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        gridRow: `2 / span ${laneCount}`,
        gridColumn: "1 / -1",
        position: "relative",
        zIndex: 0,
        cursor: "crosshair",
      }}
      title="拖动选日期，双击建新单"
    >
      {selection && (
        <div
          style={{
            position: "absolute",
            top,
            left,
            width,
            height: rowHeight,
            background: "rgba(28, 78, 120, 0.1)",
            border: "1px dashed #1c4e78",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      )}

      {popupOpen &&
        selection &&
        popupPos &&
        createPortal(
        <form
          data-new-order-popup="true"
          onMouseDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") resetAll();
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            position: "fixed",
            top: popupPos.top,
            left: popupPos.left,
            width: POPUP_WIDTH,
            boxSizing: "border-box",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            padding: 14,
            zIndex: 20,
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          <div
            style={{
              fontWeight: 500,
              color: "#222",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <span>新单子 ·</span>
            <select
              value={lo}
              onChange={(e) => {
                const newLo = Number(e.target.value);
                setSelection({ start: newLo, end: Math.max(newLo, hi), row: selection.row });
              }}
              style={{ fontSize: 12, color: "#222" }}
            >
              {timeline.map((d, i) => (
                <option key={i} value={i}>
                  {shortLabel(d).date}
                </option>
              ))}
            </select>
            <span>~</span>
            <select
              value={hi}
              onChange={(e) => {
                const newHi = Number(e.target.value);
                setSelection({ start: Math.min(lo, newHi), end: newHi, row: selection.row });
              }}
              style={{ fontSize: 12, color: "#222" }}
            >
              {timeline.map((d, i) => (
                <option key={i} value={i}>
                  {shortLabel(d).date}
                </option>
              ))}
            </select>
            <span>（{hi - lo + 1}天）</span>
          </div>
          <input
            autoFocus
            required
            placeholder="客人姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 13, padding: "6px 8px", color: "#222" }}
          />
          <style>{`
            .new-order-qty-input::-webkit-calendar-picker-indicator { display: none; }
          `}</style>
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
              男
              <input
                type="number"
                min="0"
                list="new-order-count-options"
                className="new-order-qty-input"
                value={male}
                onChange={(e) => setMale(Number(e.target.value))}
                style={{ width: "100%", fontSize: 13, padding: "6px 4px", color: "#222" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
              女
              <input
                type="number"
                min="0"
                list="new-order-count-options"
                className="new-order-qty-input"
                value={female}
                onChange={(e) => setFemale(Number(e.target.value))}
                style={{ width: "100%", fontSize: 13, padding: "6px 4px", color: "#222" }}
              />
            </label>
            <datalist id="new-order-count-options">
              {Array.from({ length: 7 }, (_, i) => i).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <input
            placeholder="去哪个地点（选填）"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ fontSize: 13, padding: "6px 8px", color: "#222" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
              每天$
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="单价"
                value={perDayPrice}
                onChange={(e) => handlePerDayChange(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "6px 4px", color: "#222" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
              总价$
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="选填"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "6px 4px", color: "#222" }}
              />
            </label>
          </div>
          {error && <div style={{ fontSize: 12, color: "#c0392b" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={resetAll}
              style={{ fontSize: 13, padding: "4px 10px", cursor: "pointer" }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                fontSize: 13,
                padding: "4px 10px",
                cursor: submitting || !name.trim() ? "default" : "pointer",
                background: "#1f5c33",
                color: "#fff",
                border: "none",
                borderRadius: 3,
              }}
            >
              {submitting ? "建单中…" : "创建"}
            </button>
          </div>
        </form>,
        document.body
      )}
    </div>
  );
}
