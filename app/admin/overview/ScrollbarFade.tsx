"use client";

import { useEffect, type RefObject } from "react";
import { fadeAlpha } from "@/lib/scrollbarFade";

// 滚动条「不动就看不见」这套的**唯一出处**。
//
// 原来日历和资源面板各写了一份，于是就发生了 CLAUDE.md 里记的那个老毛病：
// 日历那份修过三轮（transition 是死的、:hover 会让它常驻、颜色太深），
// 面板那份一次都没跟上 —— 还停在
// `transition: background .3s` + `:hover` + 写死的 rgba(0,0,0,0.2)：
//
//   · transition 那条**从来没生效过**。Chrome 不给 ::-webkit-scrollbar-*
//     跑 transition，写了不报错，颜色一跳到底
//   · :hover 等于常驻。鼠标本来就一直在资源列表上，那还谈什么「不动就消失」
//   · 写死的黑色在暗色模式下是黑压黑，等于没有
//
// 所以这次不是"把面板那份也改对"，是把两份合成一份。以后调淡出速度、
// 调颜色，只有这里一个地方。

/** 给一个滚动容器装上「滚的时候显出来、停手一会儿再慢慢淡掉」。 */
export function useScrollbarFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastScroll = 0;
    let fading: ReturnType<typeof setInterval> | null = null;

    function paint() {
      const a = fadeAlpha(Date.now() - lastScroll);
      el!.style.setProperty("--cal-thumb-a", String(a));
      if (a === 0 && fading !== null) {
        clearInterval(fading);
        fading = null;
      }
    }

    function onScroll() {
      lastScroll = Date.now();
      paint();
      // 40ms 一格：五秒淡完就是一百多格，看着是连续的
      if (fading === null) fading = setInterval(paint, 40);
    }

    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (fading !== null) clearInterval(fading);
    };
  }, [ref]);
}

/**
 * 配套的 CSS。槽的宽度始终不变（只改 thumb 的颜色），
 * 显示/隐藏不会挤动内容。
 *
 * **不透明度靠 JS 逐格改 `--cal-thumb-a`，不是 CSS transition**（理由见上）。
 * 伪元素读得到宿主元素上的自定义属性，所以由 JS 按时间把它降下来。
 *
 * **也别加 `:hover` 那条**。看着挺合理，实际上鼠标基本一直在这些区域上，
 * 等于滚动条常驻 —— 本来要的就是「不动就看不见」。
 */
export function scrollbarFadeCss(className: string): string {
  return `
    .${className}::-webkit-scrollbar { width: 8px; height: 8px; }
    .${className}::-webkit-scrollbar-track { background: transparent; }
    .${className}::-webkit-scrollbar-thumb {
      background: rgba(var(--scrollbar-thumb), var(--cal-thumb-a, 0));
      border-radius: 5px;
    }
  `;
}
