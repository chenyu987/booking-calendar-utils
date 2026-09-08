"use client";

import { useEffect } from "react";

// 分配模式下「已配的资源」那一行，人多了后面的够不着——名字被裁掉，
// 撤销用的 × 也点不到。这里让那一行能横着滚。
//
// 横向手势（触控板左右划、Shift+滚轮）靠 CSS 的 overflow-x:auto 就够了，
// 浏览器自己会处理。这个组件只补一件事：**纵向滚轮也能横着滚这一行**。
//
// 为什么只在 #assign-active-block 里接管，不给所有色块开：
// 日历最主要的两个手势就是上下滚和左右拖。要是每个色块的这一行都吃掉滚轮，
// 鼠标一压到订单上整张表就滚不动了——而屏幕上大半地方都是订单。
// 编辑中的色块同一时刻只有一个，而且你正盯着它，接管才不添乱。
export default function CardsRowScroll() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "#assign-active-block .cards-row"
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
