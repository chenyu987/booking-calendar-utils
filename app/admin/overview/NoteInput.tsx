"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refetchOrRefresh } from "./liveData";

// 备注的输入框，放在分配浮动条上。
//
// **显示的位置没变**：备注照旧显示在色块第一行、金额左边，两个状态都一样。
// 挪上来的只有「写」这个动作。原因是色块第一行是整个界面最挤的一行
// （姓名 · 地点 … 状态 … 备注 … 金额），而备注多数单子根本没有 ——
// 为一个不常用的字段，让每个资源的编辑态常年挤着，不划算。
//
// 保存走 save-field（跟其它字段同一个 Route Handler）：回车或者挪开焦点时存，
// 没改就不发请求。存完 router.refresh()，色块上那行备注立刻跟着变。
export default function NoteInput({
  orderId,
  defaultValue,
}: {
  orderId: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // 存的是「上一次落库的值」，不是初始值：连着改两次，第二次得跟第一次比
  const savedRef = useRef(defaultValue);

  async function save(value: string) {
    if (value === savedRef.current || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/admin/overview/save-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, note: value }),
      });
      if (res.ok) {
        savedRef.current = value;
        refetchOrRefresh({ orders: [orderId], notes: [orderId] }, () => router.refresh());
      }
    } catch {
      // 网络出错就当没存：值还在框里，挪开焦点会再试一次
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      name="note"
      placeholder="备注"
      defaultValue={defaultValue}
      // 挪开焦点就存 —— 人写完备注多半是直接去点别的地方，不会特意按回车
      onBlur={(e) => save(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save(e.currentTarget.value);
          e.currentTarget.blur();
        }
        // Esc 在这儿只退出输入框，别冒泡上去把整个分配态也退了
        if (e.key === "Escape") {
          e.stopPropagation();
          e.currentTarget.blur();
        }
      }}
      style={{
        width: 100,
        fontSize: 12,
        padding: "3px 6px",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.45)",
        background: "rgba(255,255,255,0.12)",
        color: "var(--on-solid)",
        opacity: saving ? 0.6 : 1,
      }}
    />
  );
}
