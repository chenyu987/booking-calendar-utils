"use client";

import { useState } from "react";
import { holderPhotoUrl } from "@/lib/holderPhoto";

// 资源清单每个资源左边的小头像。物品登记了使用人，分配时看一眼长相比只看名字生日更不容易配错。
//
// 鼠标放上去在旁边浮出大图。浮层用 position: fixed，按头像在屏幕上的位置算 ——
// 资源清单是个滚动容器（overflow），放在里面的 absolute 浮层会被裁掉。
// 没照片的显示名字首字母的灰圆，**占同样大的位置**：有照片没照片的资源，名字都对齐在同一条线上。
const SIZE = 30;
const BIG = 220;

export default function HolderAvatar({ path, name }: { path: string | null | undefined; name: string | null }) {
  const url = holderPhotoUrl(path);
  const [big, setBig] = useState<{ left: number; top: number } | null>(null);

  const base = {
    width: SIZE,
    height: SIZE,
    borderRadius: "50%",
    flexShrink: 0,
  } as const;

  if (!url) {
    return (
      <span
        aria-hidden
        title="没有照片"
        style={{
          ...base,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2, #eee)",
          color: "var(--text-faint)",
          fontSize: 12,
          border: "1px dashed var(--border)",
          boxSizing: "border-box",
        }}
      >
        {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <>
      <img
        src={url}
        alt={name ? `${name} 的照片` : "持有人照片"}
        loading="lazy"
        decoding="async"
        // 卡片整张能拖去分配（DragAssign），别让浏览器把图片单独拖走
        draggable={false}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          // 默认放头像右边；右边放不下就放左边。上下不超出窗口
          const left = r.right + 8 + BIG > window.innerWidth ? r.left - 8 - BIG : r.right + 8;
          const top = Math.min(Math.max(8, r.top - BIG / 3), window.innerHeight - BIG * 1.25 - 8);
          setBig({ left, top });
        }}
        onMouseLeave={() => setBig(null)}
        style={{ ...base, objectFit: "cover", display: "block", background: "var(--border)" }}
      />
      {big && (
        <img
          src={url}
          alt=""
          aria-hidden
          style={{
            position: "fixed",
            left: big.left,
            top: big.top,
            width: BIG,
            height: BIG * 1.25,
            objectFit: "cover",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1000,
            pointerEvents: "none",
            background: "var(--surface)",
          }}
        />
      )}
    </>
  );
}
