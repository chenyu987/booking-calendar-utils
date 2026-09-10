"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CalendarScroller from "./CalendarScroller";
import OutsideRail from "./OutsideRail";
import { widthForBandDays, clampBandDays, SCROLLBAR_ALLOWANCE } from "@/lib/bandDays";

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

// 纯前端缩放，跟 Google Sheet 右下角调百分比一个作用：订单多的时候缩小看全局。
//
// 这个组件把顶部工具栏（统计数字 + 状态图例）和资源面板一起收下来当 props，
// 是为了把缩放下拉框塞进统计那一行——缩放状态在客户端，统计行是服务端渲染的，
// 两边要挤在同一行就必须由同一个客户端组件来渲染。这样缩放不再自己占一行，
// 下面整块往上移一行。传进来的还是 Server Component，只是当 children 用。
//
// 另外注意层级：滚动容器在 zoom 的**外面**。CSS zoom 会把里面所有尺寸一起缩，
// 放里面的话缩到 90% 时容器高度也跟着缩 10%，框就填不满屏幕了。
//
// 「每行几天」也归这儿管：日历那块地的宽度 = 天数算出来的宽度，右边界是硬的，
// 排不下的日子换行而不是横着滚出去。右边帘子的手柄站的就是这条边界。
export default function ZoomableCalendar({
  toolbar,
  panel,
  bandDays,
  railWidth,
  children,
}: {
  toolbar: React.ReactNode;
  panel: React.ReactNode;
  /** 服务端按这个天数切好的段。cookie 里存的值 */
  bandDays: number;
  /** 右边那一栏拖到多宽。服务端读 cookie 当初始值，首屏不会先展开再收窄闪一下 */
  railWidth: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState(100);
  // 拖动过程中先按这个数画边界，服务端重排慢半拍
  const [preview, setPreview] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 帘子（竖条 + 对外链接）整条往上顶多少。顶到 <main> 的内容顶上，
  // 也就是跟页面标题齐平 —— 竖条从最上面一路贯到底，右上角不再空一块。
  // 量而不是写死：工具栏会换行（窄屏、图例多的时候），标题的边距也可能改
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarH, setToolbarH] = useState(0);
  // 工具栏能占到哪儿为止 —— 就到帘子左边。帘子紧贴着日历右边，日历一窄它就往左挪，
  // 写死一个 padding 挡不住：日历窄的时候统计数字会钻到链接底下去
  const rowRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [toolbarW, setToolbarW] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    // 从 <main> 的内容顶上量到日历那一行的顶上：中间隔着页面标题和工具栏，
    // 两个的高度都不固定（标题有 margin、工具栏会换行），所以量不写死
    const main = el.closest("main");
    const measure = () => {
      const own = el.offsetHeight + parseFloat(getComputedStyle(el).marginBottom || "0");
      if (!main) return setToolbarH(own);
      const mr = main.getBoundingClientRect();
      const padTop = parseFloat(getComputedStyle(main).paddingTop || "0");
      const head = el.getBoundingClientRect().top - (mr.top + padTop);
      // 量出来是负的说明这会儿没渲染（后台标签页），退回只顶工具栏那一段
      setToolbarH(head > 0 ? own + head : own);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (main) ro.observe(main);
    return () => ro.disconnect();
  }, []);


  const scale = zoom / 100;
  const days = clampBandDays(preview ?? bandDays);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const rail = railRef.current;
    if (!row || !rail) return;
    const measure = () => {
      const w = rail.getBoundingClientRect().left - row.getBoundingClientRect().left;
      // 量出来不是正数说明这会儿根本没渲染（后台标签页），保持原样别乱改
      if (w > 0) setToolbarW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [days, zoom]);

  // 天数一变就写 cookie 并让服务端重排。拖动中会连着变好几次，攒一下再发：
  // 一次重排要跑一整轮查询，每吃掉一列就发一次太浪费。
  function commit(next: number) {
    setPreview(next);
    // 这个值存库不存 cookie（设置页也要能改它，一个值不能两个地方存）。
    // 写库那一下不等它 —— 拖完立刻按新的画，落库和重渲染在后台跑
    fetch("/admin/overview/band-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: next }),
    })
      .then(() => router.refresh())
      .catch(() => router.refresh());
    // preview 要撑到重排落地才退场，直接清会先闪一下旧布局
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPreview(null), 600);
  }

  return (
    <>
      <div
        ref={toolbarRef}
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          margin: "8px 0 10px",
          flexWrap: "wrap",
          // 只占到帘子左边为止。帘子往上顶到这一行的顶上了，不拦着的话
          // 统计数字会钻到对外链接底下去
          maxWidth: toolbarW ?? undefined,
        }}
      >
        {toolbar}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
      </div>

      <div ref={rowRef} style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        {panel}
        {/* flex:1 + maxWidth 一起用，两种情况都对：
            · 这么多天放得下 → 宽度正好是这些天铺开的宽度，手柄就站在最后一天
              右边，右边界是硬的，横着滚不出去
            · 放不下（比如四周一行）→ 撑满可用宽度，日历在里面横着滚，
              跟以前一样。手柄始终在可见区右边，够得着 */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: widthForBandDays(days) * scale + SCROLLBAR_ALLOWANCE,
          }}
        >
          <CalendarScroller>
            <div style={{ zoom: `${zoom}%` }}>{children}</div>
          </CalendarScroller>
        </div>
        <OutsideRail
          days={days}
          zoom={zoom}
          liftTop={toolbarH}
          initialWidth={railWidth}
          containerRef={railRef}
          onPreview={setPreview}
          onCommit={commit}
        />
      </div>
    </>
  );
}
