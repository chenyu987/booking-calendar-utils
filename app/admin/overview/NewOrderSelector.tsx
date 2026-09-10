"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { dateRangeToArray } from "@/lib/dates";
import { computeTotalFromPerDay } from "@/lib/pricing";
import LocationInput from "@/components/LocationInput";
import { normalizeLocation, sameVenue } from "@/lib/locations";

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
  customerIdByName,
}: {
  timeline: string[];
  colWidth: number;
  rowHeight: number;
  laneCount: number;
  assigningOrderId: string | null;
  createOrderAction: (formData: FormData) => Promise<string>;
  customerIdByName: Record<string, string>;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startIdx: number; row: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // 弹窗里实际提交用的日期范围，跟 selection 分开：selection 只是画那个虚线预览框用的
  // 时间轴下标，弹窗打开之后用户应该能像 Google 日历一样直接选任意日期，不受当前
  // 时间轴渲染范围（timeline）限制——哪怕选的日子还没有任何单子覆盖到那也行
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [perDayPrice, setPerDayPrice] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [error, setError] = useState("");
  // 建单失败的提示：弹窗这时候已经关了，得有个独立的地方告诉用户没建成
  const [failed, setFailed] = useState(false);
  // 建单在跑的时候先按填的内容画一个占位色块：Supabase 一个来回就要一两秒，
  // 不这样的话点完"创建"要等好几秒日历上才冒出这个单子，像没反应一样
  const [pending, setPending] = useState<
    | { start: number; end: number; row: number; label: string; amount: string }
    | null
  >(null);

  function resetAll() {
    setPopupOpen(false);
    setSelection(null);
    setDateStart("");
    setDateEnd("");
    setPopupPos(null);
    setName("");
    setMale(0);
    setFemale(0);
    setLocation("");
    setNote("");
    setPerDayPrice("");
    setTotalPrice("");
    setError("");
    // 这个也要清：漏了的话建单那一下把它设成 true 之后就再没人改回来，
    // 下次开弹窗按钮会一直显示"建单中…"并且是禁用的
    setSubmitting(false);
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

  // 缩放（ZoomableCalendar 用的是 CSS zoom）会整体缩放这个容器的渲染尺寸，但鼠标
  // 事件的 clientX/Y 和 getBoundingClientRect() 拿到的都是缩放之后的可视像素——
  // 只有拿来算格子宽高的 colWidth/rowHeight 是没跟着缩放变的 JS 常量。直接拿常量
  // 做除法在 100% 之外的缩放比例下会算错格子，所以改成从容器实际渲染尺寸反推每格
  // 多宽多高，这样不管缩放到多少都对得上。
  function effectiveColUnit() {
    return containerRef.current!.getBoundingClientRect().width / timeline.length;
  }
  function effectiveRowUnit() {
    return containerRef.current!.getBoundingClientRect().height / laneCount;
  }

  // 弹窗位置在挂载之后按视口尺寸算，避免跟渲染时机的 window 尺寸读数赛跑；
  // 优先放选框右下方，放不下就翻到上面/左边，保证整个窗口都在可视区里
  useLayoutEffect(() => {
    if (!popupOpen || !selection || !containerRef.current) {
      setPopupPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const colUnit = rect.width / timeline.length;
    const rowUnit = rect.height / laneCount;
    const rowTop = rect.top + selection.row * rowUnit;
    const dayLeft = rect.left + Math.min(selection.start, selection.end) * colUnit;

    const belowY = rowTop + rowUnit + 4;
    const spaceBelow = window.innerHeight - belowY;
    const top =
      spaceBelow >= POPUP_EST_HEIGHT ? belowY : Math.max(rowTop - POPUP_EST_HEIGHT - 4, 8);
    const left = Math.max(8, Math.min(dayLeft, window.innerWidth - POPUP_WIDTH - 8));
    setPopupPos({ top, left });
  }, [popupOpen, selection, laneCount]);

  function dayIndexAt(clientX: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.floor(x / effectiveColUnit());
    return Math.min(Math.max(idx, 0), timeline.length - 1);
  }

  function rowIndexAt(clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.floor(y / effectiveRowUnit());
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
    let sel = selection;
    if (!sel) {
      const idx = dayIndexAt(e.clientX);
      const row = rowIndexAt(e.clientY);
      sel = { start: idx, end: idx, row };
      setSelection(sel);
    }
    setDateStart(timeline[Math.min(sel.start, sel.end)]);
    setDateEnd(timeline[Math.max(sel.start, sel.end)]);
    setPopupOpen(true);
  }

  // 弹窗里改了日期范围（天数变了），已经填过的每天单价要跟着重新算一次总价
  useEffect(() => {
    if (!dateStart || !dateEnd || perDayPrice.trim() === "") return;
    const rate = Number(perDayPrice);
    if (!Number.isFinite(rate)) return;
    const days = dateEnd >= dateStart ? dateRangeToArray(dateStart, dateEnd).length : 0;
    const partySize = (male || 0) + (female || 0);
    setTotalPrice(String(computeTotalFromPerDay(rate, days, partySize)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStart, dateEnd]);

  // 填每天单价的时候顺手把总价算出来（单价 × 天数 × 人数），总价框自己也能再改
  function handlePerDayChange(value: string) {
    setPerDayPrice(value);
    const rate = Number(value);
    if (value.trim() === "" || !Number.isFinite(rate)) return;
    if (!dateStart || !dateEnd || dateEnd < dateStart) return;
    const days = dateRangeToArray(dateStart, dateEnd).length;
    const partySize = (male || 0) + (female || 0);
    setTotalPrice(String(computeTotalFromPerDay(rate, days, partySize)));
  }

  async function submit() {
    if (!dateStart || !dateEnd || dateEnd < dateStart || !name.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const days = dateRangeToArray(dateStart, dateEnd);

    const fd = new FormData();
    fd.set("customer_name", name.trim());
    fd.set("location", location.trim());
    fd.set("note", note.trim());
    fd.set("male_count", String(male || 0));
    fd.set("female_count", String(female || 0));
    fd.set("demand_days", JSON.stringify(days));
    fd.set("amount", totalPrice.trim());
    // 这个名字页面加载时已经查到过 id 的话就直接带上，服务端能少查一次库（省一两秒）
    const knownCustomerId = customerIdByName[name.trim().toLowerCase()];
    if (knownCustomerId) fd.set("customer_id", knownCustomerId);

    // 先把弹窗关掉、同时在日历上画一个占位色块再等服务端：写库要一两秒，
    // 让人对着"建单中…"干等、或者点完日历上半天不出现，都像卡住了。
    const startIdx = timeline.indexOf(days[0]);
    const endIdx = timeline.indexOf(days[days.length - 1]);
    const row = selection ? selection.row : 0;
    const label = `${name.trim()}${location.trim() ? " · " + location.trim() : ""}`;
    const amountLabel = totalPrice.trim();
    resetAll();
    // 拖出来的这一段可能横跨两个 4 周段，只有落在本段里的才画得出占位块
    if (startIdx !== -1 && endIdx !== -1) {
      setPending({ start: startIdx, end: endIdx, row, label, amount: amountLabel });
    }

    try {
      const newOrderId = await createOrderAction(fd);
      // 只 push 不 refresh：action 里已经 revalidatePath 过了，这次跳转拿到的就是
      // 新数据。多加一个 refresh 等于白等一次服务端来回（一个来回将近 1 秒）。
      // 跳转要**带上当前的筛选**。原来是 push 一个光秃秃的地址，
      // 建完单区域筛选、资源筛选全没了，而下拉框还显示着旧值（非受控 select
      // 只在挂载时读 defaultValue），看起来就像「筛选还开着但没生效」。
      const params = new URLSearchParams(window.location.search);
      params.set("assign", newOrderId);
      // 但如果新建的这单跟当前区域/地点筛选对不上，就把这两个筛选去掉 ——
      // 不然刚建好的单会被自己的筛选藏起来，人会以为没建成。
      const region = params.get("region");
      const mtn = params.get("mtn");
      const typedLocation = location.trim();
      const fitsFilter = mtn
        ? sameVenue(typedLocation, mtn)
        : region
          ? normalizeLocation(typedLocation)?.region === region
          : true;
      if (!fitsFilter) {
        params.delete("region");
        params.delete("mtn");
      }
      router.push(`/admin/overview?${params.toString()}`);
    } catch {
      // 弹窗已经关了，错误得单独提示一下，不然建单失败会悄无声息
      setPending(null);
      setFailed(true);
    }
  }

  // 真实色块渲染出来之后（订单数变了会重新渲染），占位块就该撤掉
  useEffect(() => {
    setPending(null);
  }, [assigningOrderId]);

  if (timeline.length === 0) return null;

  const formInvalid = submitting || !name.trim() || !dateStart || !dateEnd || dateEnd < dateStart;

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
      {failed &&
        createPortal(
          <div
            onClick={() => setFailed(false)}
            style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#c0392b",
              color: "#fff",
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 4,
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              cursor: "pointer",
              zIndex: 50,
            }}
          >
            建单失败，请重试（点这里关掉）
          </div>,
          document.body
        )}

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

      {pending && (
        <div
          style={{
            position: "absolute",
            top: pending.row * (rowHeight + GAP),
            left: Math.min(pending.start, pending.end) * (colWidth + GAP),
            width:
              (Math.abs(pending.end - pending.start) + 1) * colWidth +
              Math.abs(pending.end - pending.start) * GAP,
            height: rowHeight,
            background: "#f3f4f6",
            border: "1px solid #bbb",
            borderRadius: 4,
            padding: "3px 6px",
            boxSizing: "border-box",
            fontSize: 12,
            lineHeight: 1.3,
            color: "#666",
            overflow: "hidden",
            pointerEvents: "none",
            opacity: 0.75,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: 500,
              }}
            >
              {pending.label}
            </span>
            {pending.amount && (
              <span style={{ fontSize: 11, flexShrink: 0 }}>${pending.amount}</span>
            )}
          </div>
          <div style={{ fontSize: 11 }}>建单中…</div>
        </div>
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
            <input
              type="date"
              value={dateStart}
              onChange={(e) => {
                const v = e.target.value;
                setDateStart(v);
                if (dateEnd < v) setDateEnd(v);
              }}
              style={{ fontSize: 12, color: "#222" }}
            />
            <span>~</span>
            <input
              type="date"
              value={dateEnd}
              min={dateStart || undefined}
              onChange={(e) => {
                const v = e.target.value;
                setDateEnd(v);
                if (v < dateStart) setDateStart(v);
              }}
              style={{ fontSize: 12, color: "#222" }}
            />
            {dateStart && dateEnd && dateEnd >= dateStart && (
              <span>（{dateRangeToArray(dateStart, dateEnd).length}天）</span>
            )}
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
          <div style={{ display: "flex", gap: 10 }}>
                  <LocationInput
              placeholder="去哪个地点（选填）"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "6px 8px", color: "#222" }}
            />
            <input
              placeholder="备注（选填）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "6px 8px", color: "#222" }}
            />
          </div>
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
              disabled={formInvalid}
              style={{
                fontSize: 13,
                padding: "4px 10px",
                cursor: formInvalid ? "default" : "pointer",
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
