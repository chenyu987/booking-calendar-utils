"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { clampRailWidth, RAIL_WIDTH } from "@/lib/bandDays";
import PublicRailShell from "@/components/PublicRailShell";

// 其它 admin 页右边那道「对外页面」帘子。
//
// 为什么不直接复用排期总览那个 OutsideRail：**那根条一根两用** —— 滑到日历最右边
// 时拖它是改「每行排几天」，没用到最右边才是拉宽拉窄这一栏。那半个身份只有总览
// 有意义（别的页根本没有日历）。所以这里只留「拉宽拉窄」这一半。
//
// **但长什么样必须一模一样** —— 外壳走 PublicRailShell 那一份，宽度走同一个
// clampRailWidth、同一个 cookie。之前两处各写各的样式，同一个宽度值画出来差 10px，
// 拉出来的长度就对不上了。
//
// cookie 名字里的 overview 是历史包袱：对人来说这就是同一道帘子，在总览拖宽了、
// 切到 Order 页还该是那么宽，所以共用。改名要同时动总览那边的读取，不值当。
export default function PublicRail({ initialWidth }: { initialWidth: number }) {
  const pathname = usePathname();
  const [width, setWidth] = useState(clampRailWidth(initialWidth));
  const [dragging, setDragging] = useState(false);

  // 排期总览自己有一道（还兼着改每行天数），这儿让开，免得出现两道
  if (pathname?.startsWith("/admin/overview")) return null;

  function remember(next: number) {
    setWidth(next);
    document.cookie = `overview_rail_width=${next}; path=/; max-age=31536000`;
  }

  function beginDrag(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const startX = e.clientX;
    const startWidth = width;
    let latest = startWidth;

    function onMove(ev: MouseEvent) {
      // 往右拖收起，往左拖展开 —— 跟总览那道、跟左边侧边栏都是一个方向
      latest = clampRailWidth(startWidth - (ev.clientX - startX));
      setWidth(latest);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // **命令式改了 body 的样式，就得自己负责撤**（CLAUDE.md）
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragging(false);
      // 拖到哪儿留在哪儿，不往两头吸 —— 半开着也是一个有效状态
      remember(latest);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // 双击：没开满就开满，开满了就收起。跟总览那道同一个意思
  function toggle() {
    remember(width < RAIL_WIDTH ? RAIL_WIDTH : 0);
  }

  return (
    // paddingRight 跟 layout 里内容区的右内边距一样：总览那道帘子长在内容区**里面**，
    // 右边自带 8px；这道长在外面，不补上的话手柄会紧贴屏幕最右边，很难抓
    <div style={{ display: "flex", flexShrink: 0, paddingRight: 8 }}>
      <PublicRailShell
        width={width}
        dragging={dragging}
        headerText="对外页面"
        title={width === 0 ? "拖开 / 双击展开对外页面" : "拖动拉宽拉窄；双击收起或开满"}
        onMouseDown={beginDrag}
        onDoubleClick={toggle}
      />
    </div>
  );
}
