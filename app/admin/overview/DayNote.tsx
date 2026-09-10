"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

// 日期条上「这一天的备注」。
//
// 没写东西的时候**完全看不出来**——没有边框、没有占位文字、没有加号，就是日期条
// 底下那条空白。鼠标移上去才浮出一条虚线，告诉你这儿能写。这是故意的：一屏上有
// 二三十列，每列都摆一个「＋备注」的话，日历就被这些永远用不上的按钮淹了。
//
// 写完的备注就正常显示出来，不藏。藏起来的是入口，不是内容。
export default function DayNote({
  day,
  note,
  peak,
}: {
  day: string;
  /** 库里存的备注，没有就是空字符串 */
  note: string;
  /** peak 那几列底色是紫的，hover 的虚线跟着深一点才看得见（见 app/layout.tsx 的 CSS） */
  peak?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // 乐观显示：存库要等一个来回，先把打的字显示出来，别让人以为没保存上
  const [shown, setShown] = useState(note);
  const [failed, setFailed] = useState(false);
  // Esc 撤销之后输入框会卸载，卸载会顺带触发一次 blur。用 ref 把「这次是撤销」
  // 传过去，不然 blur 那条路会把刚撤销掉的内容又存回去
  const cancelledRef = useRef(false);

  async function save(next: string) {
    const trimmed = next.trim();
    if (trimmed === shown) return;
    setShown(trimmed);
    setFailed(false);
    try {
      const res = await fetch("/admin/overview/day-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, note: trimmed }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      // 存不上就退回原样并标红，不能让它看着像存上了
      setShown(note);
      setFailed(true);
    }
  }

  if (editing) {
    // 回车和失焦是两条独立的保存路径，**回车不经过 blur**。
    // 早先写成「回车 → blur() → 在 onBlur 里存」，看着省事，实际上把保存
    // 挂在了浏览器肯不肯发 blur 事件上：文档本身没有焦点的时候（后台标签页、
    // 无头浏览器）blur 根本不发，回车就成了哑的。现在回车直接拿值存。
    //
    // 两条路都走到 save()，重复调用无所谓：值没变会自己早退。
    const finish = (value: string, cancelled: boolean) => {
      cancelledRef.current = cancelled;
      setEditing(false);
      if (!cancelled) save(value);
    };
    return (
      <input
        autoFocus
        defaultValue={shown}
        onBlur={(e) => {
          if (!cancelledRef.current) finish(e.target.value, false);
          cancelledRef.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(e.currentTarget.value, false);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish("", true);
          }
        }}
        style={{
          width: "100%",
          border: "1px solid var(--text-faint)",
          borderRadius: 3,
          padding: "0 3px",
          fontSize: 11,
          lineHeight: "15px",
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      // hover 的虚线走 CSS 不走 state：进出编辑态时这个 div 会被输入框换掉，
      // 鼠标移走那一刻它已经不在，onMouseLeave 收不到，state 就永久卡住
      className={
        shown ? "day-note" : `day-note-empty${peak ? " day-note-peak" : ""}`
      }
      title={shown ? `${shown}（点一下改）` : "点一下给这天写备注"}
      style={{
        minHeight: 15,
        fontSize: 11,
        lineHeight: "15px",
        cursor: "text",
        color: failed ? "var(--danger)" : "var(--text)",
        fontWeight: shown ? 500 : 400,
        // 一列 150px 宽，长备注截断，全文在 title 里
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        // 空的时候唯一的提示就是这条虚线，颜色由 CSS 的 :hover 点亮；
        // 平时是透明的，但边框一直占着 1px，免得鼠标进出时整条日期条抖一下
        borderBottom: "1px dashed transparent",
      }}
    >
      {failed ? "没存上，再点一下试试" : shown}
    </div>
  );
}
