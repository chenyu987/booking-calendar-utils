"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const STORAGE_KEY = "overview-calendar-scroll";

// 日历自己滚（横竖都是），页面本身不跟着滚——这样滑到十二月去分配时，
// 左边的导航栏和资源列表还在原地，不用滑回来。
//
// 滚动位置存在 sessionStorage 里，特意不用 localStorage：
//   · 刷新页面 / 配完资源跳转回来 → 位置还在原处（sessionStorage 扛得住刷新）
//   · 关掉标签页第二天再进来 → 位置没了，自动跳到"今天"那一列
// 正好是想要的：干活当中不打断，隔天回来不会还停在几个月前的单子上。
export default function CalendarScroller({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        el.scrollLeft = x ?? 0;
        el.scrollTop = y ?? 0;
        return;
      } catch {
        // 存的东西坏了就当没存过，走下面跳今天的逻辑
      }
    }

    // 没有存过位置（新开的标签页）：滚到"今天"那一列，左边留一点点上下文。
    // 用 rect 相对差值来算，不用 offsetLeft/offsetTop——那两个是相对
    // offsetParent 的，这里的 offsetParent 不是滚动容器，算出来会偏。
    const todayCell = el.querySelector<HTMLElement>('[data-today="1"]');
    if (todayCell) {
      const c = el.getBoundingClientRect();
      const t = todayCell.getBoundingClientRect();
      el.scrollLeft += t.left - c.left - el.clientWidth * 0.12;
      el.scrollTop += t.top - c.top;
    }
  }, []);

  // 高度按"视口剩下多少"实时算，不写死：日历上面那一坨（标题/统计/筛选）的高度
  // 会变（比如冒出报错信息），写死的话不是页面被撑出滚动条，就是白白浪费一截。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function fit() {
      const top = el!.getBoundingClientRect().top + window.scrollY;
      el!.style.maxHeight = `${Math.max(240, window.innerHeight - top - 24)}px`;
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    let idleTimer: ReturnType<typeof setTimeout>;
    function onScroll() {
      // 滚的时候把滚动条显出来，停下来一会儿再淡掉，平时视野干净
      el!.classList.add("cal-scrolling");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => el!.classList.remove("cal-scrolling"), 700);

      clearTimeout(timer);
      // 滚动事件很密，停下来再存，别每一帧都写一次
      timer = setTimeout(() => {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ x: el!.scrollLeft, y: el!.scrollTop })
        );
      }, 150);
    }
    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
      clearTimeout(idleTimer);
    };
  }, []);

  return (
    <>
      {/* 滚动条平时透明、滚的时候才显出来。槽的宽度始终不变（只改 thumb 的颜色），
          这样显示/隐藏不会挤动内容，不会一滚就跳一下。 */}
      <style>{`
        .cal-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .cal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cal-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 5px;
          transition: background 0.3s ease;
        }
        .cal-scroll.cal-scrolling::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.28);
        }
        .cal-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.16);
        }
      `}</style>
    <div
      ref={ref}
      className="cal-scroll"
      style={{
        overflow: "auto",
        // 具体高度挂载后按视口算（见上面的 fit），这里给个兜底值防止首帧太高
        maxHeight: "70vh",
        paddingBottom: 12,
        // 不加这条的话 maxHeight 只管内容区，下面这 12px padding 会额外撑出去，
        // 正好把整页顶出一条滚动条
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
    </>
  );
}
