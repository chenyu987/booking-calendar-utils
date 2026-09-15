"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  PROVIDER_BAND_DAYS_MAX,
  PROVIDER_BAND_DAYS_MIN,
  clampProviderBandDays,
} from "@/lib/providerBoard";
import { VIEW_COOKIES } from "@/lib/providerView";
import { isIsoDate } from "@/lib/timelineStart";

/**
 * 日历怎么排：每行几天、从哪天开始。**收在账号菜单里** —— 一年调一次的东西，
 * 摆在日历旁边等于每次进来都要跨过它才看见正事。
 *
 * 跟 ThemeToggle 一个路子：**cookie 直接在客户端写**，写完 `router.refresh()`
 * 让服务端按新设置再渲染一次。原来是个 Server Action + redirect，而 redirect 会
 * 把整个 /provider 渲染完才回响应，还会把界面上换过的资源、切过的视图一起冲掉
 * （那些现在是组件状态）。refresh 不是导航，状态留着。
 *
 * 这儿的 clamp / 日期合法性只是别写脏 cookie，**真正的把关在服务端读的时候**
 * （`readViewSettings`）—— cookie 是浏览器里的东西，谁都能改。
 */
export default function ViewSettings({
  bandDays,
  start,
  from,
  to,
}: {
  bandDays: number;
  start: string;
  /** 起始日能挑的范围，跟服务端夹的是同一个（providerWindowBounds） */
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState(String(bandDays));
  const [day, setDay] = useState(start);
  const [saved, setSaved] = useState(false);

  function write(name: string, value: string) {
    if (value) document.cookie = `${name}=${value}; path=/; max-age=31536000`;
    else document.cookie = `${name}=; path=/; max-age=0`;
  }

  function save() {
    write(VIEW_COOKIES.bandDays, String(clampProviderBandDays(days)));
    // 填了个不存在的日子（2026-02-31 这种）就当没填 —— 与其让日历从一个说不清的
    // 地方开始，不如回默认
    write(VIEW_COOKIES.start, isIsoDate(day) ? day : "");
    setSaved(true);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={labelStyle}>
        从哪天开始
        <input
          type="date"
          min={from}
          max={to}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setSaved(false);
          }}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        每行几天
        <input
          type="number"
          min={PROVIDER_BAND_DAYS_MIN}
          max={PROVIDER_BAND_DAYS_MAX}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          style={inputStyle}
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={save} style={buttonStyle}>
          应用
        </button>
        {saved && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>已应用</span>}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
        日历只看今天往前两周、往后四周，起始日也在这个范围里挑，留空 = 回到默认。
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 12,
  color: "var(--text-muted)",
};
const inputStyle: React.CSSProperties = {
  padding: 5,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};
const buttonStyle: React.CSSProperties = {
  padding: "5px 12px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
};
