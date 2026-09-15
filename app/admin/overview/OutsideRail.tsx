"use client";

import { useRef, useState } from "react";
import {
  clampBandDays,
  clampRailWidth,
  dragDelta,
  autoStepSpeed,
  DEFAULT_BAND_DAYS,
  MAX_BAND_DAYS,
  MIN_BAND_DAYS,
  RAIL_WIDTH,
} from "@/lib/bandDays";
import PublicRailShell from "@/components/PublicRailShell";

// 日历右边那道帘子。同一根条，拖起来有两种意思，看你有没有滑到日历最右边：
//
//
// **没用到最右边**：这根条这会儿只是根分隔线，不代表哪一天的边界，拖它就是
// 收起/展开右边这一栏，跟左边资源面板一个意思。
export default function OutsideRail({
  days,
  zoom,
  liftTop,
  initialWidth,
  containerRef,
  onPreview,
  onCommit,
}: {
  days: number;
  /** 百分比，日历是 CSS zoom 缩的，一列在屏幕上多宽要跟着换算 */
  zoom: number;
  /** 往上顶多少（工具栏那一行的高度），好让竖条从最顶上贯穿下来 */
  liftTop: number;
  /** 这一栏拖到多宽（0 = 完全收起）。服务端读 cookie 当初始值，首屏不会闪 */
  initialWidth: number;
  /** 外面拿去量「工具栏能占到哪儿」 */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** 拖动中：只改画出来的宽度，不打服务端 */
  onPreview: (days: number) => void;
  /** 松手：写 cookie + 让服务端按新天数重新切段 */
  onCommit: (days: number) => void;
}) {
  // 这一栏拖到多宽。**不吸附**：拖到哪儿留在哪儿，半开着也是一个有效状态
  const [width, setWidth] = useState(clampRailWidth(initialWidth));
  // "days" = 改每行几天，"rail" = 拉宽拉窄这一栏
  const [mode, setMode] = useState<null | "days" | "rail">(null);
  // 压边连续加减的计时器。用 setInterval 不用 requestAnimationFrame：
  // 这里变的是个整数计数器（一秒最多跳二十来下），不是动画，不需要跟刷新率对齐；
  // 而 rAF 在页面不可见时会被浏览器停掉，行为不好预料也没法测
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 松手时把**实际拖到的宽度**存下来，不往两头吸。
  // 必须把拖出来的宽度传进来 —— 读 state 拿到的是拖之前的旧值
  function settleRail(finalWidth: number) {
    const next = clampRailWidth(finalWidth);
    setWidth(next);
    document.cookie = `overview_rail_width=${next}; path=/; max-age=31536000`;
  }

  function beginDrag(e: React.MouseEvent) {
    e.preventDefault();
    const sc = document.querySelector<HTMLElement>(".cal-scroll");
    if (!sc) return;

    // 滑到最右边了吗？留 4px 余量，浏览器这三个值经常差个零点几
    const atEnd = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4;
    // 完全收起来的时候一律当成「拖开这一栏」——不然在最右边时拖它去改天数，
    // 这一栏就只能靠双击才拖得回来了
    const kind: "days" | "rail" = width === 0 || !atEnd ? "rail" : "days";
    setMode(kind);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const startX = e.clientX;
    const startDays = days;
    const startWidth = width;
    const box = sc.getBoundingClientRect();

    // 压着边连续加减用的：每一跳按「速度 × 这一跳的时长」累加小数天
    let pointerX = startX;
    let auto = 0;
    let lastDays = startDays;
    let lastWidth = startWidth;
    let lastTs = Date.now();

    function currentDays() {
      return clampBandDays(
        startDays + dragDelta(pointerX - startX, zoom / 100) + Math.trunc(auto)
      );
    }

    function tick() {
      const ts = Date.now();
      const speed = autoStepSpeed(pointerX, box.left, box.right);
      if (speed !== 0) {
        auto += (speed * (ts - lastTs)) / 1000;
        const next = currentDays();
        // 到头了就别再攒了，不然往回拖要先把攒的还回去，像卡住一样
        if (next === MIN_BAND_DAYS || next === MAX_BAND_DAYS) auto = Math.trunc(auto);
        if (next !== lastDays) {
          lastDays = next;
          onPreview(next);
        }
      }
      lastTs = ts;
    }

    function onMove(ev: MouseEvent) {
      pointerX = ev.clientX;
      if (kind === "rail") {
        // 往右拖收起，往左拖展开 —— 跟左边侧边栏那根一个方向
        lastWidth = clampRailWidth(startWidth - (ev.clientX - startX));
        setWidth(lastWidth);
        return;
      }
      const next = currentDays();
      if (next === lastDays) return;
      lastDays = next;
      onPreview(next);
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (tickRef.current !== null) clearInterval(tickRef.current);
      tickRef.current = null;
      setMode(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (kind === "rail") {
        settleRail(lastWidth);
        return;
      }
      // 重排只在松手时做一次。放在拖动过程中的话，每变一天就要跑一整轮查询
      // 重画整页，卡不说，重渲染还会把正拖着的这一下打断
      if (lastDays !== startDays) onCommit(lastDays);
    }

    if (kind === "days") tickRef.current = setInterval(tick, 50);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // 双击：这一栏没全开就一把拉满；全开着就改成在「四周一行」和「一周一行」之间跳
  function toggle() {
    if (width < RAIL_WIDTH) {
      settleRail(RAIL_WIDTH);
      return;
    }
    // 双击是「回默认」不是「拉到上限」——上限八周一行，一下摊那么开多半不是想要的
            onCommit(clampBandDays(days > 7 ? 7 : DEFAULT_BAND_DAYS));
  }

  const dragging = mode !== null;

  return (
    // 整条（竖线 + 链接）往上顶到工具栏顶上：竖线不断在半路，
    // 右上角那块空白也补上了
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "stretch",
        alignSelf: "stretch",
        flexShrink: 0,
        marginTop: -liftTop,
      }}
    >
      <PublicRailShell
        width={width}
        dragging={dragging}
        headerText={mode === "days" ? `每行 ${days} 天 · 松手重排` : "对外页面"}
        headerHighlighted={mode === "days"}
        title={
          width === 0
            ? "拖开 / 双击展开对外页面"
            : "滑到日历最右边时拖它改每行几天（拖到边上压着会一直减）；没用到最右边时拖它拉宽拉窄这一栏"
        }
        onMouseDown={beginDrag}
        onDoubleClick={toggle}
      />
    </div>
  );
}
