"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorToast } from "./AssignActions";
import { getSelection } from "./assignSelection";
import { daysBetween, shiftDays, shortLabel } from "@/lib/dates";

// 按住订单色块拖到别的日子：整单挪过去（天数、总价不变，不连续的单间隔不变）。
//
// 手势跟 DragAssign（拖资源分配）、ResizableOrderBlock（拖边框改天数）一个路子，
// 自己接 mousedown/mousemove，不引库：
//
//   按住 + 移动 ≥4px  → 拿起来：原来那几段变淡，一个影子按天对齐跟着走
//   松手在某一天上     → 整单挪到那一天（拿起的是哪一天，就把那一天放到松手的那一天）
//   单击不动          → 跟原来一样进分配态，这里一个字都不拦
//   Esc / 松在日历外   → 不挪
//
// **松手当场就画在新位置上，写库在后台**（跟退出分配态那套一个思路，blockPatch.ts）：
// 原来那几段藏起来，被拖的那一段 clone 一份嵌进落点那一段日历的格子里（跟着日历滚，
// 看着就是一个真色块）。写库 + 整页渲染要一两秒，不让人对着「挪动中…」干等。
// 等「存完之后才开始查库」的那次渲染到了（main[data-rendered-at] 晚于 move 回的 at），
// 服务端画的新位置接上，再撤掉 clone、放出原来那几段。
// 一单好几段（日期不连续、被带子切开）的，当场只画被拖的那一段，别的段等服务端那次渲染。
//
// 校验在服务端（move/route.ts）：撞上同一个资源在别单的日子、挪出物品的有效期都会被拦，
// 拦住时一天都不写，这边撤回原位、把原因用红条说出来。
//
// 能挪的是**普通态**的色块（<a data-order-id>）。正在分配的那一单不接 ——
// 编辑框里有没存的字段，挪日期跟它搅在一起说不清先后。
// 一单在后台存着的时候，这一单先不让再拖（它的新位置还是个 clone），别的单照常拖。
//
// 命令式的东西有三样，每样都有撤销点（CLAUDE.md「命令式改了 DOM 就得自己负责撤」）：
//   - 变淡 / 藏起来 / 「别选中文字」：注入 CSS 规则（state 驱动，撤 = 清 state）
//   - 拖着时的影子（挂在 body 上）和松手后的 clone（挂在日历格子里）：各自的撤销函数里摘，
//     组件卸载时全摘
//   - 松手后紧跟着的那次 click：吞掉，下一轮宏任务就放开

const DRAG_THRESHOLD = 4;
// 边缘自动滚，跟 DragAssign 同一套数（窄，宽了最靠边那一列放不下去）
const EDGE = 24;
const EDGE_SPEED = 14;
// 后台写库 + 整页渲染迟迟不回来（网断了）：clone 不能一直挂着骗人
const SETTLE_TIMEOUT = 15000;
// 格子之间的 gap，跟 page.tsx 那张 grid 的 gap: 2 是一个数
const GRID_GAP = 2;

type Hit = { day: string; cellLeft: number; band: HTMLElement; index: number };

type Drag = {
  orderId: string;
  el: HTMLElement;
  startX: number;
  startY: number;
  /** 拿起的那一天 */
  grabDay: string;
  /** 拿起的那一天在被拖这一段里是第几天（0 起）：落下时这一段的第一天 = 落点 - 它 */
  grabOffset: number;
  /** 被拖这一段占几列 */
  segLength: number;
  /** 这一单最早那天（色块上的 data-order-start），只用来给影子写「挪到哪天开始」 */
  orderStart: string;
  /** 指针离色块左上角多远：影子按这个偏移跟着走 */
  offX: number;
  offY: number;
  /** 拿起那一天的格子左边离色块左边多远：影子左边 = 落点格子左边 - 它 */
  cellOff: number;
  dragging: boolean;
};

function bandCells(band: HTMLElement): HTMLElement[] {
  return Array.from(band.querySelectorAll<HTMLElement>(":scope > [data-day]"));
}

/** 指针底下是哪一天：先找它所在的那一段日历，再按表头那一排格子的横坐标对 */
function dayAt(x: number, y: number): Hit | null {
  const bands = document.querySelectorAll<HTMLElement>("[data-band-grid]");
  for (const band of bands) {
    const r = band.getBoundingClientRect();
    if (y < r.top || y > r.bottom || x < r.left || x > r.right) continue;
    const cells = bandCells(band);
    for (let i = 0; i < cells.length; i++) {
      const cr = cells[i].getBoundingClientRect();
      // 格子之间有 2px 的 gap，算进左边那一格，不然落在缝上就成了「哪天都不是」
      if (x >= cr.left && x < cr.right + GRID_GAP) {
        return { day: cells[i].dataset.day!, cellLeft: cr.left, band, index: i };
      }
    }
  }
  return null;
}

/** 「从 12/15 开始」：只说新的第一天，不把整单日子下发到每个色块上（一季 1800 单） */
function newStartLabel(orderStart: string, delta: number): string {
  if (!orderStart) return "";
  return ` · 从 ${shortLabel(shiftDays([orderStart], delta)[0]).date} 开始`;
}

/** clone 一份色块，去掉会被别人认出来的属性 —— 变淡 / 藏起来的规则、多选、点色块进分配态都认 data-order-id */
function inertClone(el: HTMLElement): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement;
  for (const a of ["data-order-id", "data-order-start", "data-edit-seg", "data-order-label", "href"]) {
    g.removeAttribute(a);
  }
  g.querySelectorAll("[data-order-id]").forEach((n) => n.removeAttribute("data-order-id"));
  g.style.pointerEvents = "none";
  return g;
}

/**
 * 松手后当场画的那一块：嵌进落点那一段日历的 grid，列按天、行按指针所在那一道。
 * 越出这一段两头的部分截掉（服务端那次渲染会把它画到下一段去）
 */
function landInGrid(d: Drag, hit: Hit, pointerY: number): HTMLElement | null {
  const cells = bandCells(hit.band);
  const first = hit.index - d.grabOffset;
  const s = Math.max(0, first);
  const e = Math.min(cells.length - 1, first + d.segLength - 1);
  if (e < s) return null;
  // 行：表头那一行跟色块一样高（page.tsx 的 HEADER_ROW_HEIGHT = ROW_HEIGHT），
  // 按表头格子的实际高度 + gap 算一道多高（日历外面套着 CSS zoom，量出来的才准）
  const bandRect = hit.band.getBoundingClientRect();
  const scale = hit.band.offsetHeight ? bandRect.height / hit.band.offsetHeight : 1;
  const unit = cells[0].getBoundingClientRect().height + GRID_GAP * scale;
  const row = Math.max(2, Math.floor((pointerY - bandRect.top) / unit) + 1);
  const g = inertClone(d.el);
  g.dataset.moveLanded = "1";
  Object.assign(g.style, {
    gridColumn: `${s + 1} / span ${e - s + 1}`,
    gridRow: String(row),
    position: "relative",
    zIndex: "2",
  });
  hit.band.appendChild(g);
  return g;
}

export default function DragMove() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 正在拖的那一单：原来那几段变淡
  const [dimId, setDimId] = useState<string | null>(null);
  // 松手了、后台还在存的那几单：原来那几段藏起来（新位置是 clone）
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let drag: Drag | null = null;
    let ghost: HTMLElement | null = null;
    let badge: HTMLElement | null = null;
    let target: Hit | null = null;
    let pointer = { x: 0, y: 0 };
    let raf: number | undefined;
    let swallowClick = false;
    // 后台在存的：orderId → 撤掉它当场画的那一块
    const pending = new Map<string, () => void>();

    function removeGhost() {
      ghost?.remove();
      ghost = null;
      badge = null;
    }

    // 拖拽本身结束（不管挪没挪）
    function endDrag() {
      drag = null;
      target = null;
      removeGhost();
      setSelecting(false);
      setDimId(null);
      if (raf !== undefined) cancelAnimationFrame(raf);
      raf = undefined;
    }

    function makeGhost(d: Drag) {
      const r = d.el.getBoundingClientRect();
      const g = inertClone(d.el);
      // 日历外面套了一层 CSS zoom，影子挂在 body 上不吃那层缩放，按实际渲染尺寸补回来
      const scale = d.el.offsetWidth ? r.width / d.el.offsetWidth : 1;
      Object.assign(g.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: `${d.el.offsetWidth}px`,
        height: `${d.el.offsetHeight}px`,
        margin: "0",
        zIndex: "1000",
        opacity: "0.92",
        transformOrigin: "top left",
        boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
        cursor: "grabbing",
      });
      g.dataset.moveGhost = "1";
      g.dataset.scale = String(scale);
      const b = document.createElement("div");
      Object.assign(b.style, {
        position: "absolute",
        left: "0px",
        bottom: "100%",
        marginBottom: "4px",
        whiteSpace: "nowrap",
        fontSize: "12px",
        lineHeight: "1.3",
        padding: "2px 8px",
        borderRadius: "4px",
        background: "var(--link)",
        color: "var(--on-solid)",
      });
      g.appendChild(b);
      document.body.appendChild(g);
      ghost = g;
      badge = b;
    }

    function place() {
      if (!drag || !ghost || !badge) return;
      target = dayAt(pointer.x, pointer.y);
      const scale = Number(ghost.dataset.scale) || 1;
      // 横向按天对齐，纵向跟着指针走（跨段放也看得出往哪儿去）
      const left = target ? target.cellLeft - drag.cellOff : pointer.x - drag.offX;
      const top = pointer.y - drag.offY;
      ghost.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
      const delta = target ? daysBetween(drag.grabDay, target.day) : null;
      if (delta === null) {
        badge.textContent = "放到日历上的某一天";
      } else if (delta === 0) {
        badge.textContent = "原地";
      } else {
        badge.textContent = `${delta > 0 ? "+" : ""}${delta} 天${newStartLabel(drag.orderStart, delta)}`;
      }
    }

    function autoScroll() {
      if (!drag?.dragging) return;
      const scroller = document.querySelector<HTMLElement>(".cal-scroll");
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const { x, y } = pointer;
        const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        if (inside) {
          const maxX = scroller.scrollWidth - scroller.clientWidth;
          const maxY = scroller.scrollHeight - scroller.clientHeight;
          if (x < r.left + EDGE && scroller.scrollLeft > 0) scroller.scrollLeft -= EDGE_SPEED;
          else if (x > r.right - EDGE && scroller.scrollLeft < maxX) scroller.scrollLeft += EDGE_SPEED;
          if (y < r.top + EDGE && scroller.scrollTop > 0) scroller.scrollTop -= EDGE_SPEED;
          else if (y > r.bottom - EDGE && scroller.scrollTop < maxY) scroller.scrollTop += EDGE_SPEED;
        }
      }
      // 滚动之后指针底下换了一天，影子跟着重新对齐
      place();
      raf = requestAnimationFrame(autoScroll);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (drag) return;
      const el = (e.target as HTMLElement | null)?.closest?.(
        "a[data-order-id]"
      ) as HTMLElement | null;
      if (!el) return;
      const orderId = el.dataset.orderId!;
      if (orderId === getSelection() || pending.has(orderId)) return;
      const hit = dayAt(e.clientX, e.clientY);
      if (!hit) return;
      // 这一段从这一带的第几列开始、占几列：OrderBlock 的 gridColumn 是「起 / span 长」
      const m = /^(\d+)\s*\/\s*span\s+(\d+)$/.exec(el.style.gridColumn.trim());
      const segStart = m ? Number(m[1]) - 1 : hit.index;
      const segLength = m ? Number(m[2]) : 1;
      const r = el.getBoundingClientRect();
      drag = {
        orderId,
        el,
        startX: e.clientX,
        startY: e.clientY,
        grabDay: hit.day,
        grabOffset: hit.index - segStart,
        segLength,
        orderStart: el.dataset.orderStart ?? "",
        offX: e.clientX - r.left,
        offY: e.clientY - r.top,
        cellOff: hit.cellLeft - r.left,
        dragging: false,
      };
    }

    function onMouseMove(e: MouseEvent) {
      pointer = { x: e.clientX, y: e.clientY };
      if (!drag) return;
      if (!drag.dragging) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.dragging = true;
        // 按下那一刻 OptimisticAssign 已经抢画了分配浮动条 —— 这一下是拖，不是点，让它撤
        window.dispatchEvent(new Event("overview:order-drag-start"));
        window.getSelection()?.removeAllRanges();
        setSelecting(true);
        setDimId(drag.orderId);
        makeGhost(drag);
        raf = requestAnimationFrame(autoScroll);
      }
      place();
    }

    function settle(orderId: string) {
      pending.get(orderId)?.();
    }

    function onMouseUp() {
      const d = drag;
      if (!d) return;
      if (!d.dragging) {
        // 没拖动就是一次普通的点击，交给 InstantAssign
        drag = null;
        return;
      }
      // 拖完浏览器会在松手的地方补一个 click：吞掉，不然会进分配态 / 退出分配态
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);

      const t = target;
      const delta = t ? daysBetween(d.grabDay, t.day) : 0;
      const y = pointer.y;
      endDrag();
      if (!t || delta === 0) return;

      // 当场画到新位置，原来那几段藏起来；写库在后台
      const landed = landInGrid(d, t, y);
      setHiddenIds((ids) => [...ids, d.orderId]);
      let mo: MutationObserver | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      pending.set(d.orderId, () => {
        pending.delete(d.orderId);
        landed?.remove();
        mo?.disconnect();
        if (timer) clearTimeout(timer);
        setHiddenIds((ids) => ids.filter((x) => x !== d.orderId));
      });

      (async () => {
        try {
          const res = await fetch("/admin/overview/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: d.orderId, from_day: d.grabDay, to_day: t.day }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "挪日期没成功");
          // 等「存完之后才开始查库」的那次渲染到了再撤 —— 不然撤了 clone、
          // 新位置还没画出来，那一单会凭空消失一两秒
          const at = Number(json.at) || Date.now();
          const settled = () => {
            const raw = document.querySelector<HTMLElement>("[data-rendered-at]")?.dataset.renderedAt;
            return raw ? Number(raw) >= at : false;
          };
          if (!pending.has(d.orderId)) return; // 组件已经卸载
          mo = new MutationObserver(() => settled() && settle(d.orderId));
          mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["data-rendered-at"],
          });
          timer = setTimeout(() => settle(d.orderId), SETTLE_TIMEOUT);
          routerRef.current.refresh();
        } catch (e: any) {
          // 存不上：撤回原位 + 把原因说出来。不提示的话看起来就是「挪过去又自己跳回来了」
          settle(d.orderId);
          setError(e.message ?? "挪日期没成功");
        }
      })();
    }

    function onClick(e: MouseEvent) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && drag?.dragging) {
        // Esc 也会被 BulkSelect / InstantAssign 收到，那是它们的事；这里只管把这次拖拽作废
        endDrag();
      }
    }

    // <a> 默认能被原生拖走（拖出一个链接），那样 mousemove 就收不到了
    function onDragStart(e: DragEvent) {
      if ((e.target as HTMLElement | null)?.closest?.("a[data-order-id]")) e.preventDefault();
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    // 挂在 window 的捕获阶段：比 document 上 InstantAssign / BulkSelect 的捕获监听还早
    window.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("dragstart", onDragStart);
      endDrag();
      [...pending.values()].forEach((undo) => undo());
    };
  }, []);

  // id 是 UUID，过一道白名单再拼进选择器，没有注入面
  const safe = (id: string | null) => (id && /^[A-Za-z0-9-]+$/.test(id) ? id : null);
  const dim = safe(dimId);
  const hidden = hiddenIds.map(safe).filter(Boolean);
  const css =
    (dim ? `a[data-order-id="${dim}"]{opacity:.3!important;}` : "") +
    hidden.map((id) => `a[data-order-id="${id}"]{visibility:hidden!important;}`).join("") +
    (selecting ? `body{user-select:none!important;cursor:grabbing!important;}` : "");

  return (
    <>
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}
      {/* 跟 OptimisticAssign 那处一个道理：<style> 的文本子节点会被 React 转义 */}
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
    </>
  );
}
