"use client";

import { useEffect, useRef, useState } from "react";
import { RESOURCE_SORTS, DEFAULT_RESOURCE_SORT, type ResourceSort } from "@/lib/resourceSort";

// 资源清单的排序入口。
//
// 为什么不是一个 <select>：那玩意儿要占满一行，而排序跟上面那几个筛选框
// 不是一类东西 —— 筛选是「少看几张」，排序是「换个看法」，一直摊在那儿
// 反而把真正要填的筛选条件挤下去了。收成一个图标按钮，点开才出现。
//
// 图标用「从长到短的三根横杠」：这个形状现在到处都是排序的意思，不用配文字。
// **非默认排序时按钮整个高亮** —— 不然收起来之后，「我的资源怎么是这个顺序」
// 会找不到原因，跟筛选收起时必须把条件摘要出来是同一个道理。
//
// 每一项就是个普通链接（?ssort=…），跟别的筛选一样把状态留在 URL 上：
// 刷新还在、分享链接也带着。不做客户端状态。
export default function SortMenu({
  current,
  hrefFor,
}: {
  current: ResourceSort;
  /** 给定排序方式生成链接 —— URL 怎么拼是服务端的事，这儿只管点 */
  hrefFor: Record<ResourceSort, string>;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const active = current !== DEFAULT_RESOURCE_SORT;

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // 关掉菜单就够了，别让这下 Esc 继续冒泡去退出分配态
        e.stopPropagation();
      }
    }
    // 捕获阶段：面板外面还挂着别的全局点击监听（多选、点外面退出编辑），
    // 让它们先看到这一下没关系，但我们得保证自己一定收得到
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: "relative", flexShrink: 0 }}>
      <style>{`
        @keyframes sortmenu-in {
          from { opacity: 0; transform: translateY(-4px) }
          to { opacity: 1; transform: none }
        }
        .sortmenu-btn:hover { background: var(--surface-2) }
        .sortmenu-item:hover { background: var(--surface-2) }
      `}</style>

      <button
        type="button"
        className="sortmenu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="排序方式"
        title={`排序：${RESOURCE_SORTS[current]}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          padding: 0,
          cursor: "pointer",
          borderRadius: 6,
          // 不描边、不铺底色：旁边「筛选」那个按钮本来就有框，这儿再来一个
          // 就成了两个框并排，比它俩要表达的东西还抢眼。
          // 平时是一个纯图标，鼠标移上去才浮出一块底 —— 够说明它点得动了
          border: "none",
          background: "transparent",
          // 默认就跟「筛选」两个字同一个灰。**只有非默认排序时才变蓝** ——
          // 那时候「我的资源怎么是这个顺序」需要一个当场能看见的解释，
          // 平时没必要一直亮着抢注意力
          color: active ? "var(--link)" : "var(--text-muted)",
        }}
      >
        {/* 从长到短的三根横杠。round 的端点是为了在 11px 这种小尺寸下
            看着不像三段断线 */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M2.5 4h11M2.5 8h7.5M2.5 12h4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            // 贴左边展开：按钮挪到「筛选」旁边之后，贴右边的话菜单会往左
            // 探出面板外面去
            left: 0,
            zIndex: 20,
            minWidth: 168,
            padding: 4,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            animation: "sortmenu-in 120ms ease-out",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              padding: "4px 10px 4px",
            }}
          >
            排序
          </div>
          {(Object.keys(RESOURCE_SORTS) as ResourceSort[]).map((k) => {
            const on = k === current;
            return (
              <a
                key={k}
                role="menuitemradio"
                aria-checked={on}
                href={hrefFor[k]}
                className="sortmenu-item"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  textDecoration: "none",
                  color: on ? "var(--link)" : "var(--text)",
                  fontWeight: on ? 600 : 400,
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>{RESOURCE_SORTS[k]}</span>
                {/* 勾在右边，不占左边的缩进 —— 四项左边缘对齐，扫一眼就读完 */}
                <span style={{ marginLeft: "auto", opacity: on ? 1 : 0 }}>✓</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
