"use client";

import { useId, useState } from "react";
import { suggestCustomers, customerHandle, customerName, type ReferralCustomer } from "@/lib/referral";

// 选人的输入框。**打了字才给候选。**
//
// 原生 <datalist> 一聚焦就把全部选项倒出来 —— 几百个客户糊满半屏，那不是补全
// 是干扰，真要找的那个还得在里面翻。拦不住这个行为，所以候选自己控制：
// 没输入就给一张空的候选表，浏览器自然什么都不弹。
//
// 筛选逻辑在 lib/referral.ts 的 suggestCustomers（能单测）。
// **别把它挪到这个文件里** —— "use client" 模块导出的函数，服务端 import 到的是
// 个客户端引用，调不了（CLAUDE.md 里 parseView 那个坑）。
export default function PersonInput({
  name,
  placeholder,
  people,
  width = 190,
}: {
  name: string;
  placeholder: string;
  people: ReferralCustomer[];
  width?: number;
}) {
  // 两个框同时在页面上，各自要有自己的候选表，id 不能撞
  const listId = useId();
  const [q, setQ] = useState("");
  const hits = suggestCustomers(q, people);

  return (
    <>
      <input
        name={name}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list={listId}
        placeholder={placeholder}
        required
        autoComplete="off"
        style={{
          padding: 6,
          border: "1px solid var(--border-strong)",
          borderRadius: 4,
          fontSize: 14,
          width,
          boxSizing: "border-box",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />
      <datalist id={listId}>
        {hits.map((r) => (
          <option key={r.id} value={customerHandle(r)}>
            {customerName(r) === customerHandle(r) ? "" : customerName(r)}
            {r.referred_by ? "（已有介绍人）" : ""}
          </option>
        ))}
      </datalist>
    </>
  );
}
