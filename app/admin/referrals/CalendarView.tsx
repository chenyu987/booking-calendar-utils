"use client";

import { useState } from "react";
import ReferralCalendar from "./ReferralCalendar";
import { clampBandDays, SCROLLBAR_ALLOWANCE, widthForBandDays } from "@/lib/bandDays";
import {
  REFERRAL_COL_GAP,
  REFERRAL_COL_WIDTH,
  type ReferralBoard,
} from "@/lib/referralBoard";

// 日历 + 上面那排「每行几天」的预设。
//
// **原来是右边一根 6px 的竖条，拖它改天数。** 那是照搬排期总览的做法，但在那边
// 那根条同时还是日历的右边界、还兼着收展「对外页面」那一栏，有存在感；
// 挪到这儿就只剩一根看不出能拖的灰线，位置还在最右边 —— 要调视图得先找到它。
// 换成一排点一下就生效的预设。
//
// **而且这一下不需要新数据**：每行排几天只影响 `splitBoardIntoBands` 怎么切带子，
// 盘子（board）本身不变。所以天数是客户端状态，点了当场重排；
// 顺手往服务端写一份只是为了下次打开还是这个视图，**不等它、也不 refresh**。
const PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "1 周" },
  { days: 14, label: "2 周" },
  { days: 28, label: "4 周" },
  { days: 56, label: "8 周" },
];

export default function CalendarView({
  board,
  today,
  initialBandDays,
  panels,
}: {
  board: ReferralBoard;
  today: string;
  initialBandDays: number;
  panels: Record<string, React.ReactNode>;
}) {
  const [days, setDays] = useState(clampBandDays(initialBandDays));

  function pick(next: number) {
    const n = clampBandDays(next);
    setDays(n);
    // 写库是「下次打开还是这个视图」用的，当场的重排不依赖它，所以不等、不 refresh。
    // 失败了也不弹什么 —— 最坏的结果是下次打开回到上一个视图
    fetch("/admin/referrals/band-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: n }),
    }).catch(() => {});
  }

  return (
    <>
      {/* 预设 + 滑块。**不做成「日历 | 台账」那种贴在一起的段控件** —— 试过，
          那个太素了，看不出是「调多少」而不是「切到哪个视图」，两排长得一样的
          东西叠在一起反而更难认。分开的圆角按钮 + 一个带当前值的滑块，
          一眼就知道这是个量的调节 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "0 0 8px",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <span>每行</span>
        {PRESETS.map((p) => {
          const on = days === p.days;
          return (
            <button
              key={p.days}
              type="button"
              onClick={() => pick(p.days)}
              style={{
                padding: "2px 10px",
                fontSize: 12,
                borderRadius: 4,
                cursor: "pointer",
                border: `1px solid ${on ? "var(--solid-bg)" : "var(--border-strong)"}`,
                background: on ? "var(--solid-bg)" : "var(--surface)",
                color: on ? "var(--on-solid)" : "var(--text-muted)",
              }}
            >
              {p.label}
            </button>
          );
        })}
        {/* 预设之外还想要个别的数就拖这个。拖动中只改本地状态，
            松手才写库 —— 中间那十几个值没必要每个都发一次 */}
        <input
          type="range"
          min={7}
          max={56}
          step={1}
          value={days}
          onChange={(e) => setDays(clampBandDays(Number(e.target.value)))}
          onMouseUp={(e) => pick(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => pick(Number((e.target as HTMLInputElement).value))}
          title="每行排几天"
          style={{ width: 120, marginLeft: 4 }}
        />
        <span style={{ color: "var(--text-faint)" }}>{days} 天</span>
      </div>

      {/* **宽度按天数封顶** —— 列是 `minmax(112px, 1fr)`，不封顶的话选「1 周」
          七列会各自撑到三百多像素，一格宽得离谱。封了之后放得下就正好这么宽，
          放不下（8 周）就撑满可用宽度、在里面横着滚 */}
      <div
        style={{
          maxWidth:
            widthForBandDays(days, 1, REFERRAL_COL_WIDTH, REFERRAL_COL_GAP) +
            SCROLLBAR_ALLOWANCE,
        }}
      >
        <ReferralCalendar board={board} bandDays={days} today={today} panels={panels} />
      </div>
    </>
  );
}
