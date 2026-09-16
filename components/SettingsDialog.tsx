"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_BAND_DAYS, MAX_BAND_DAYS } from "@/lib/bandDays";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

export type Settings = {
  overview_start: string | null;
  band_days: number;
  /** 介绍人返点的全局默认比例，**百分数**（10 = 10%） */
  referral_rate: number;
};

// 设置弹框。原来是 /admin/settings 一个页面，改成弹框：设置是「顺手调一下」，
// 为它整页跳走再跳回来，手上的位置（滚到哪一周、正在配哪一单）就没了。
//
// 用原生 <dialog showModal()>：Esc 关闭、焦点圈在框里、背景不可点，
// 这些浏览器自己就做了，不用自己写一套。
//
// **当前值由外面预取好再传进来**（见 SettingsTrigger），这里不自己拉 ——
// 打开时才拉的话框会分两段出现：先一个空壳，内容再蹦出来。
export default function SettingsDialog({
  open,
  onClose,
  initialTheme,
  data,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialTheme: Theme | null;
  data: Settings;
  onSaved: (next: Settings) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(initialTheme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setError("");
      setSaved(false);
    }
    if (!open && el.open) el.close();
  }, [open]);

  function currentTheme(): Theme {
    if (theme) return theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // 换肤不走服务端也不用点保存：纯界面状态，改了立刻生效。
  // cookie 是给下一次服务端渲染用的，这样刷新不会先亮后暗闪一下
  function toggleTheme() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000`;
    setTheme(next);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next: Settings = {
      overview_start: String(form.get("overview_start") ?? "") || null,
      band_days: Number(form.get("band_days")),
      referral_rate: Number(form.get("referral_rate")),
    };
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overview_start: String(form.get("overview_start") ?? ""),
          band_days: String(form.get("band_days") ?? ""),
          referral_rate: String(form.get("referral_rate") ?? ""),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "没存上");
      setSaved(true);
      // 存完把新值交回给外面缓存着，下次打开直接就是新的，不用再拉一次
      onSaved(next);
      // 起始日期和每行几天都是服务端切日历用的，存完得让页面按新的重画
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "没存上");
    } finally {
      setSaving(false);
    }
  }

  const dark = currentTheme() === "dark";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 点框外面关掉：原生 dialog 的点击落在 ::backdrop 上时，target 就是 dialog 本身
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 0,
        width: "min(460px, 92vw)",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <form onSubmit={save} style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>设置</h2>
          <button type="button" onClick={onClose} style={closeStyle} title="关闭">
            ✕
          </button>
        </div>
        <p style={hintStyle}>
          存在库里，换台机器也一样。缩放、面板收起、右边那一栏拖多宽，那些是各自机器上的习惯，不在这儿。
        </p>

        <section style={sectionStyle}>
          <div style={labelStyle}>外观</div>
          <p style={hintStyle}>没选过就跟系统走。这一项只存在这台机器上。</p>
          <button type="button" onClick={toggleTheme} style={themeBtnStyle}>
            <span aria-hidden>{dark ? "☀" : "☾"}</span>
            {dark ? "切到亮色" : "切到暗色"}
          </button>
        </section>

        <section style={sectionStyle}>
          <div style={labelStyle}>排期总览：日历从哪天开始</div>
          <p style={hintStyle}>
            留空就是默认：从最早的单子（或今天，看哪个更早）往前一点开始。
            补录历史单、或者只想看季后半段时，在这儿定一个日子。
          </p>
          <input
            key={`start-${data.overview_start ?? ""}`}
            type="date"
            name="overview_start"
            defaultValue={data.overview_start ?? ""}
            style={inputStyle}
          />
        </section>

        <section style={sectionStyle}>
          <div style={labelStyle}>排期总览：每行排几天</div>
          <p style={hintStyle}>
            {MIN_BAND_DAYS}~{MAX_BAND_DAYS} 天。也可以直接在排期总览里拖右边那根竖条改，
            两边改的是同一个值。
          </p>
          <input
            key={`days-${data.band_days}`}
            type="number"
            name="band_days"
            min={MIN_BAND_DAYS}
            max={MAX_BAND_DAYS}
            defaultValue={data.band_days}
            style={{ ...inputStyle, width: 90 }}
          />
        </section>

        <section style={sectionStyle}>
          <div style={labelStyle}>介绍人返点：默认比例</div>
          <p style={hintStyle}>
            新建介绍关系时预填这个数。**只影响以后新建的** —— 已经建好的关系
            各自存着当初谈定的比例，改这儿不会把历史返点金额一起改掉。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              key={`rate-${data.referral_rate}`}
              type="number"
              name="referral_rate"
              min={0}
              max={100}
              step="0.01"
              defaultValue={data.referral_rate}
              style={{ ...inputStyle, width: 90 }}
            />
            <span style={hintStyle}>%</span>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button type="submit" disabled={saving} style={saveStyle}>
            {saving ? "存中…" : "保存"}
          </button>
          {saved && !error && <span style={{ fontSize: 13, color: "var(--ok)" }}>已保存</span>}
          {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
        </div>
      </form>
    </dialog>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "10px 12px",
  marginTop: 12,
};
const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500 };
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-faint)",
  lineHeight: 1.6,
  margin: "4px 0 10px",
};
const inputStyle: React.CSSProperties = {
  padding: 6,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
const themeBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "var(--surface-2)",
  color: "var(--text-muted)",
  fontSize: 13,
  cursor: "pointer",
};
const saveStyle: React.CSSProperties = {
  padding: "8px 16px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
const closeStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-faint)",
  fontSize: 16,
  cursor: "pointer",
  lineHeight: 1,
  padding: 4,
};
