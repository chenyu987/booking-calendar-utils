"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

// 亮色 / 暗色 / 跟随系统。**改了立刻生效，不用点保存** —— 纯界面状态，
// 走一趟服务端只会让它慢半拍。
//
// cookie 是给**下一次服务端渲染**用的：`app/layout.tsx` 会在服务端把
// data-theme 写进 <html>，所以刷新不会先亮一下再变暗。
// 「跟随系统」= 把 cookie 删掉，让 prefers-color-scheme 说了算。
//
// admin 那边的 SettingsDialog 只有亮/暗两档，回不到「跟随系统」——
// 这里多给一档，代价只是一个按钮。
export default function ThemeToggle({ initial }: { initial: Theme | null }) {
  const [theme, setTheme] = useState<Theme | null>(initial);

  function pick(next: Theme | null) {
    const root = document.documentElement;
    if (next) {
      root.dataset.theme = next;
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000`;
    } else {
      delete root.dataset.theme;
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
    }
    setTheme(next);
  }

  const options: { value: Theme | null; label: string }[] = [
    { value: null, label: "跟随系统" },
    { value: "light", label: "亮色" },
    { value: "dark", label: "暗色" },
  ];

  return (
    <div style={rowStyle}>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => pick(o.value)}
          style={theme === o.value ? activeStyle : buttonStyle}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  overflow: "hidden",
};
const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: "5px 0",
  border: "none",
  background: "none",
  color: "var(--text-muted)",
  fontSize: 12,
  cursor: "pointer",
};
const activeStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
};
