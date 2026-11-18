"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { refetchOrRefresh } from "./liveData";

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
      refetchOrRefresh({ dayNotes: true }, () => router.refresh());
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
          // 挪到右下角之后右对齐：文字结束的位置对齐，不写的时候那条虚线
          // 也贴着右边，不会在一列中间悬着
          textAlign: "right",
          background: "var(--surface)",
          // 编辑时也跟着这一列的颜色：打字时看到的就是存下来之后的样子
          color: "inherit",
          fontWeight: 600,
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
        textAlign: "right",
        cursor: "text",
        // **颜色跟着这一列走**（inherit）：周末那几列是橙的、peak 是紫的，
        // 备注写在同一格里，用另一个颜色会像是从别处飘过来的一块。
        // 写了字就加粗一档 —— 这一格里它是唯一「有人特意写了点什么」的东西
        color: failed ? "var(--danger)" : "inherit",
        fontWeight: shown ? 600 : 400,
        // 一列就那么宽，长备注截断，全文在 title 里
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
