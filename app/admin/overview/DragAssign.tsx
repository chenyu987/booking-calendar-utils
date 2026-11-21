"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorToast, useAssignCall } from "./AssignActions";

// 从左边把资源「拿起来」，拖到日历上的订单色块里配上。
//
// 手势跟这个项目里另外两处一致（ResizableOrderBlock 拖边框改天数、
// NewOrderSelector 拖空白建单），都是自己接 mousedown/mousemove，不引库：
//
//   按住 + 移动 ≥4px  → 拿起来，影子跟着鼠标
//   拖到色块上松手     → 配这个资源
//   双击              → 打开卡片详情（原来单击的效果）
//   单击不动          → 什么都不做
//
// **分配模式开不开都能拖** —— 顺带的好处是不进分配模式也能分配。
//
// 合法性校验在松手之后：打的是 /admin/overview/assign，跟「配这单」按钮、
// 跟浮动条上输入名字分配走同一条路，服务端那四条校验一条不少，
// 被拒了弹同一个红色错误条。

const DRAG_THRESHOLD = 4;
// 边缘自动滚的触发区。**必须窄** —— 宽了会把日历最靠边那一列订单整个盖住，
// 想往那儿放就一直在滚，根本放不下去（70px 试过，正是这个毛病）。
const EDGE = 24;
const EDGE_SPEED = 14;

export default function DragAssign() {
  const router = useRouter();
  const { error, dismiss, run } = useAssignCall();
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(
    null
  );

  // run 的引用会随 pending 变，用 ref 拿最新的，避免监听器里抓到旧闭包
  const runRef = useRef(run);
  runRef.current = run;

  const start = useRef<{ x: number; y: number; id: string; name: string } | null>(null);
  const dragging = useRef(false);
  const target = useRef<HTMLElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const justDragged = useRef(false);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    function highlight(el: HTMLElement | null) {
      if (target.current === el) return;
      if (target.current) target.current.style.removeProperty("box-shadow");
      target.current = el;
      if (el) el.style.boxShadow = "0 0 0 3px var(--ok)";
    }

    function autoScroll() {
      if (!dragging.current) return;
      const scroller = document.querySelector<HTMLElement>(".cal-scroll");
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const { x, y } = pointer.current;
        // 指针得确实在日历上方；而且**只有还滚得动才滚** —— 已经到头了还
        // 一直触发的话，边上那一列就永远放不下去
        const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        if (inside) {
          const maxX = scroller.scrollWidth - scroller.clientWidth;
          const maxY = scroller.scrollHeight - scroller.clientHeight;
          if (x < r.left + EDGE && scroller.scrollLeft > 0) {
            scroller.scrollLeft -= EDGE_SPEED;
          } else if (x > r.right - EDGE && scroller.scrollLeft < maxX) {
            scroller.scrollLeft += EDGE_SPEED;
          }
          if (y < r.top + EDGE && scroller.scrollTop > 0) {
            scroller.scrollTop -= EDGE_SPEED;
          } else if (y > r.bottom - EDGE && scroller.scrollTop < maxY) {
            scroller.scrollTop += EDGE_SPEED;
          }
        }
      }
      raf.current = requestAnimationFrame(autoScroll);
    }

    function stop() {
      dragging.current = false;
      start.current = null;
      highlight(null);
      setGhost(null);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
      raf.current = undefined;
    }

    function onMouseDown(e: MouseEvent) {
      // 只接左键，且不接修饰键（Cmd/Ctrl+点 要留给「新标签页打开」）
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const card = (e.target as HTMLElement | null)?.closest?.(
        "[data-resource-id]"
      ) as HTMLElement | null;
      if (!card) return;
      // 卡片右下角那个「配这单」绿箭头不参与拖拽，点它就是点它
      if ((e.target as HTMLElement).closest("button")) return;
      start.current = {
        x: e.clientX,
        y: e.clientY,
        id: card.dataset.resourceId!,
        name: card.dataset.resourceName ?? "这个资源",
      };
    }

    function onMouseMove(e: MouseEvent) {
      pointer.current = { x: e.clientX, y: e.clientY };
      const s = start.current;
      if (!s) return;

      if (!dragging.current) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD) return;
        dragging.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        raf.current = requestAnimationFrame(autoScroll);
      }

      // 影子挡住了指针底下的东西，找落点时要先把它藏开
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      highlight((under?.closest("[data-order-id]") as HTMLElement) ?? null);
      setGhost({ name: s.name, x: e.clientX, y: e.clientY });
    }

    function onMouseUp() {
      const s = start.current;
      const dropOn = target.current;
      const wasDragging = dragging.current;
      const orderId = dropOn?.dataset.orderId;
      stop();
      if (!wasDragging || !s) return;
      // 拖完紧接着会来一个 click，得把它吞掉，否则会跳到卡片详情页
      justDragged.current = true;
      if (orderId) {
        runRef.current({ order_id: orderId, resource_id: s.id, op: "add" });
      }
    }

    // 单击不再打开卡片详情（改成双击）—— 不这样的话「按住准备拖」松手就跳走了
    function onClick(e: MouseEvent) {
      if (justDragged.current) {
        justDragged.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // 新标签页打开还留着
      const card = (e.target as HTMLElement | null)?.closest?.("[data-resource-id]");
      if (!card) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
    }

    function onDoubleClick(e: MouseEvent) {
      const card = (e.target as HTMLElement | null)?.closest?.(
        "[data-resource-id]"
      ) as HTMLElement | null;
      const href = card?.querySelector("a")?.getAttribute("href");
      if (href) router.push(href);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDoubleClick);
      stop();
    };
  }, [router]);

  return (
    <>
      {error && <ErrorToast message={error} onClose={dismiss} />}
      {ghost && (
        <div
          style={{
            position: "fixed",
            left: ghost.x + 12,
            top: ghost.y + 12,
            zIndex: 100,
            pointerEvents: "none",
            background: "var(--ok)",
            color: "var(--on-solid)",
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 4,
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          {ghost.name} → 拖到订单上分配
        </div>
      )}
    </>
  );
}
