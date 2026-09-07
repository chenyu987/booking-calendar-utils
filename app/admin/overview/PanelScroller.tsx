"use client";

import { useLayoutEffect, useRef } from "react";

// 资源列表自己滚，别把整页撑长。
//
// 资源多了以后（现在 6 张，一个季会更多）面板比视口还高，整页就会出竖向滚动条——
// 那样往下翻看最后一个资源时，右边的日历会跟着一起滚走，跟"日历自己滚、别的不动"
// 正好相反。这里把列表卡在视口内，页面就不滚了。
//
// 只包列表部分：上面的搜索框和筛选条留在外面固定住，不然滚下去就没法搜了。
export default function PanelScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // 高度按视口剩余实时算，跟 CalendarScroller 一个思路：上面那块（标题/筛选）
  // 高度会变（比如冒出报错、多一行"清除"按钮），写死会算错
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function fit() {
      const h = window.innerHeight;
      // 视口偶尔会短暂读成 0（还没布局完），这时候算出来是错的，跳过等下一次回调
      if (!h) return;
      const top = el!.getBoundingClientRect().top + window.scrollY;
      el!.style.maxHeight = `${Math.max(200, h - top - 10)}px`;
    }
    fit();
    // 用 ResizeObserver 而不是 window 的 resize 事件：上面那块（标题/筛选/报错）
    // 高度变化时 resize 不会触发，而且程序化改视口尺寸也可能不发 resize
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {/* 滚动条平时透明，鼠标移上来才淡出来，跟日历那边保持一致 */}
      <style>{`
        .panel-scroll::-webkit-scrollbar { width: 8px; }
        .panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 4px;
          transition: background 0.3s ease;
        }
        .panel-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
        }
      `}</style>
      <div ref={ref} className="panel-scroll" style={{ overflowY: "auto" }}>
        {children}
      </div>
    </>
  );
}
