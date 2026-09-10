"use client";

import { useEffect } from "react";

// 两处「单行放不下」的地方：分配色块里「已配的资源」那一行（人多了后面的够不着，
// 名字被裁掉、撤销的 × 也点不到），以及左边资源清单上「已排 …」那一行
// （一个资源排过好几段，后面的看不见）。这里让它们能横着滚。
//
// 横向手势（触控板左右划、Shift+滚轮）靠 CSS 的 overflow-x:auto 就够了，
// 浏览器自己会处理。这个组件只补一件事：**纵向滚轮也能横着滚这一行**。
//
// 为什么只在 #assign-active-block 里接管，不给所有色块开：
// 日历最主要的两个手势就是上下滚和左右拖。要是每个色块的这一行都吃掉滚轮，
// 鼠标一压到订单上整张表就滚不动了——而屏幕上大半地方都是订单。
// 编辑中的色块同一时刻只有一个，而且你正盯着它，接管才不添乱。
export default function CardsRowScroll() {
  // 「已排 …」那一行默认停在最右边 —— 时间是正序排的（早 → 晚），
  // 但最有用的是最近一次，所以视窗停在最新那一头，早期的踪迹推到左边，
  // 想看往左滑。
  //
  // 没写依赖数组：这一行的内容是服务端渲染的，分配、改单、刷新之后 DOM 会换一批，
  // 每次渲染完都重新对齐一次才不会停在半路。DOM 操作很便宜，一屏也就几十个。
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".booked-row").forEach((el) => {
      el.scrollLeft = el.scrollWidth;
    });
  });

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      // 两处单行横滚：分配色块里「已配的资源」，以及左边资源清单上「已排 …」。
      // 后者只在这个资源当前配得出去时才带 data-scrollable —— 那一列是个纵向滚动的
      // 长列表，每个资源都吃掉滚轮的话列表本身就滚不动了。
      const el = (e.target as HTMLElement | null)?.closest?.(
        "#assign-active-block .cards-row, .booked-row[data-scrollable]"
      ) as HTMLElement | null;
      if (!el) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return; // 没溢出，没什么可滚的

      // 横向的手势交给浏览器原生处理，这里只管纵向那一下
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      // 已经滚到头了就把这一下让回给页面，别把日历的上下滚动卡死在这一行上
      const atStart = e.deltaY < 0 && el.scrollLeft <= 0;
      const atEnd = e.deltaY > 0 && el.scrollLeft >= max - 1;
      if (atStart || atEnd) return;

      // passive:false 才允许 preventDefault——不拦住的话页面会跟着一起上下滚
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
