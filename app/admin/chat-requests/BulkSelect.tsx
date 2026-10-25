"use client";

import { useEffect, useState } from "react";

// 需求表的批量勾选。每行的勾选框用 HTML 的 form 属性挂到同一个表单（id = BULK_FORM）上，
// 不用包在一个大表单里 —— 每行自己已经有一个「保存」的表单了，表单不能套表单。
//
// 这里只管三件事：表头那个「全选这一页」、按住 Shift 勾一段、「已选 N 条」。真正改库的是 bulkUpdateRequests。

export const BULK_FORM = "bulk-requests";

function boxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM}"]`));
}

/**
 * Shift 连选：点一行，再按住 Shift 点另一行，中间（含两头）全设成第二下点完的样子 ——
 * 跟邮箱、文件管理器一个手感。第二下是取消勾，那一段就一起取消。
 * 挂在 document 上（勾选框是服务端画的），在 SelectAll 里装一次。
 */
function useShiftRange() {
  useEffect(() => {
    let last: HTMLInputElement | null = null;
    const onClick = (e: MouseEvent) => {
      const box = e.target as HTMLInputElement;
      if (!(box instanceof HTMLInputElement) || box.name !== "ids" || box.getAttribute("form") !== BULK_FORM) return;
      const all = boxes();
      // 上一下点的那个已经不在页面上了（筛选换了一批），就当这是第一下
      if (e.shiftKey && last && all.includes(last)) {
        const [a, b] = [all.indexOf(last), all.indexOf(box)].sort((x, y) => x - y);
        for (const x of all.slice(a, b + 1)) x.checked = box.checked;
        // 浏览器选中了两下之间的文字，看着像出错，清掉
        window.getSelection()?.removeAllRanges();
      }
      last = box;
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

/** 表头的全选框。一部分勾着时显示成「半选」 */
export function SelectAll() {
  useShiftRange();
  const [state, setState] = useState<"none" | "some" | "all">("none");
  useEffect(() => {
    const sync = () => {
      const all = boxes();
      const on = all.filter((b) => b.checked).length;
      setState(on === 0 ? "none" : on === all.length ? "all" : "some");
    };
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return (
    <input
      type="checkbox"
      aria-label="全选这一页"
      checked={state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      onChange={(e) => {
        const on = e.target.checked;
        boxes().forEach((b) => (b.checked = on));
        // 改 checked 不会自己冒 change 事件，补一个让「已选 N 条」跟上
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

/**
 * 批量那一排：已选几条、设成哪个状态、按钮。放在服务端渲染的 <form id={BULK_FORM}> 里面。
 * 没选的时候按钮是灰的，免得点了才知道没选。
 */
export function BulkControls({
  options,
  selectStyle,
  buttonStyle,
}: {
  options: { value: string; label: string }[];
  selectStyle?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return (
    <>
      <span style={{ fontSize: 14 }}>已选 {n} 条，设成</span>
      <select name="bulk_status" defaultValue="ignored" style={selectStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={n === 0} style={{ ...buttonStyle, opacity: n === 0 ? 0.4 : 1 }}>
        批量设置
      </button>
    </>
  );
}
