"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clampNavWidth, NAV_CONTENT_WIDTH } from "@/lib/navWidth";

// 侧边栏外壳 + 右边那根可拖拽的分隔条。
// 导航链接本身还是 layout（Server Component）渲染的，这里只当 children 收下来，
// 这个组件只管宽度状态和拖拽。

export default function ResizableNav({
  initialWidth,
  children,
}: {
  initialWidth: number;
  children: React.ReactNode;
}) {
  const [width, setWidth] = useState(initialWidth);
  const dragRef = useRef<{ originX: number; originWidth: number } | null>(null);
  // 手机上侧边栏是个抽屉（样式在 lib/adminMobile.ts，桌面上这几样都不起作用）。
  // 开没开是纯客户端状态：点一下就该出来，不值得回服务端
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  // 点了导航里的链接 = 换了页，抽屉自己收起来，不然新页面还被它盖着
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function beginDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { originX: e.clientX, originWidth: width };
    // 不锁住选中的话，拖的时候会把整页文字刷成蓝的
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function widthAt(clientX: number) {
      const d = dragRef.current!;
      return clampNavWidth(d.originWidth + (clientX - d.originX));
    }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setWidth(widthAt(ev.clientX));
    }

    function onUp(ev: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!dragRef.current) return;
      const next = widthAt(ev.clientX);
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setWidth(next);
      // 直接写 cookie，不走 Server Action：拖拽本来就在客户端，走服务端等于
      // 每次松手都重渲染整个 admin 树。服务端下次渲染读这个值当初始宽度，
      // 所以跳页面不会丢、首屏也不会闪（localStorage 就会闪，服务端读不到）。
      document.cookie = `admin_nav_width=${next}; path=/; max-age=31536000`;
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <>
      {/* 手机顶栏：桌面上 display:none，窄屏才露出来（.admin-topbar） */}
      <div className="admin-topbar" style={{ display: "none" }}>
        <button
          type="button"
          aria-label="打开导航"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ☰
        </button>
        <span style={{ fontWeight: 500, fontSize: 14 }}>Admin 后台</span>
      </div>
      <div
        className="admin-nav-backdrop"
        data-open={drawerOpen || undefined}
        onClick={() => setDrawerOpen(false)}
        style={{ display: "none" }}
      />
      <nav
        className="admin-nav"
        data-open={drawerOpen || undefined}
        style={{ width, flexShrink: 0, overflow: "hidden" }}
      >
        {/* 内容宽度固定，不跟着外壳缩。外壳 overflow:hidden 负责裁切，
            这样拖窄时文字是被切掉而不是换行——换行会把导航撑成好几行高。 */}
        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            minWidth: NAV_CONTENT_WIDTH + 32,
            padding: 16,
          }}
        >
          {children}
        </div>
      </nav>
      <div
        className="admin-nav-handle"
        onMouseDown={beginDrag}
        title="拖动调整侧边栏宽度"
        style={{
          width: 5,
          flexShrink: 0,
          cursor: "col-resize",
          // 这条 1px 线就是原来 nav 上的 borderRight，挪到手柄左边缘，
          // 位置不变但现在整根都能拖
          borderLeft: "1px solid var(--border)",
        }}
      />
    </>
  );
}
