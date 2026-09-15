"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProviderFit } from "@/lib/providerBoard";

/**
 * 日历上一个「我能接」的单子：块本身 + 点开之后贴在它下面的选资源浮层。
 *
 * **这里破例用了客户端状态**（这一页别的开关都走 URL 参数）。理由是量出来的：
 * `/provider` 渲染一次 2~2.5 秒（要查资源、单、分配、意向，全是往 Supabase 的来回）。
 * 走 `?propose=<id>` 的话，「点一下把浮层打开」也得等这 2 秒 —— 而这一步根本没有
 * 任何服务端的事要做，纯粹是「我想看看有哪几个资源能接」。
 *
 * 提交那一步同理：POST 到 /provider/propose 拿到结果就当场改按钮，整页交给
 * `router.refresh()` 在后台更新，人不用盯着转圈。
 */
export default function ProposePicker({
  orderId,
  location,
  gap,
  title,
  fits,
  blockStyle,
  selectedStyle,
  popoverPlace,
}: {
  orderId: string;
  location: string;
  gap: string;
  title: string;
  fits: ProviderFit[];
  /** 块的样式由服务端那边算好传进来 —— 几何只许有一份 */
  blockStyle: React.CSSProperties;
  /** 选中时多加的那圈光 */
  selectedStyle: React.CSSProperties;
  /** 浮层摆在哪 —— 块下面那一格，位置由外面那张 grid 给（这儿不算像素） */
  popoverPlace: React.CSSProperties;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");

  const left = fits.filter((f) => !f.proposed && !done.includes(f.resourceId));

  async function propose(resourceId: string) {
    setBusy(resourceId);
    setError("");
    try {
      const res = await fetch("/provider/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, resource_id: resourceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "没提上，再试一次");
        return;
      }
      // 当场标成已提，再让整页在后台跟上 —— 等整页回来才变的话，
      // 点完那一两秒里人不知道到底提上没有
      setDone((d) => [...d, resourceId]);
      router.refresh();
    } catch {
      setError("网络没通，再试一次");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        title={title}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{ ...blockStyle, cursor: "pointer", ...(open ? selectedStyle : null) }}
      >
        <div style={lineStyle}>{location}</div>
        <div style={lineStyle}>{done.length > 0 && left.length === 0 ? "已提意向" : gap}</div>
      </div>

      {open && (
        <>
          {/* 点别处就关掉。浮层自己在它上面（zIndex 更大），点浮层不会被它吃掉 */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 3 }}
            aria-hidden
          />
          {/* 浮层比一格宽是常事（两个资源名 + 取消），所以外面这层只负责「站在哪一格」，
              里面那层绝对定位、`width: max-content`，想多宽多宽，不被格子勒住 */}
          <div style={{ ...popoverPlace, position: "relative", zIndex: 4, minWidth: 0 }}>
            <div style={popoverStyle}>
              {left.map((f) => (
                <button
                  key={f.resourceId}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => propose(f.resourceId)}
                  style={{ ...buttonStyle, opacity: busy && busy !== f.resourceId ? 0.5 : 1 }}
                >
                  {busy === f.resourceId ? "提交中…" : f.holderName}
                </button>
              ))}
              {/* 提过的那张也得说一声，不然「我明明有两个资源怎么只给一个按钮」 */}
              {fits
                .filter((f) => f.proposed || done.includes(f.resourceId))
                .map((f) => (
                  <span key={f.resourceId} style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {f.holderName} 已提
                  </span>
                ))}
              {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
              <button type="button" onClick={() => setOpen(false)} style={cancelStyle}>
                {left.length === 0 ? "知道了" : "取消"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const lineStyle: React.CSSProperties = {
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};
const popoverStyle: React.CSSProperties = {
  position: "absolute",
  top: 1,
  left: 0,
  width: "max-content",
  display: "flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  boxShadow: "0 2px 8px rgba(0,0,0,.12)",
};
const buttonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
};
const cancelStyle: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 12,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
};

/**
 * 清单那一行右边的「我可以接」。资源是定死的（清单按「资源 × 单」列），
 * 所以不用挑，只剩一道确认 —— 点一下太轻了，而意向是要发给管理员的东西。
 *
 * 跟日历那条路共用同一个接口和同一套即时反馈：不跳转、不整页渲染。
 */
export function ProposeOneCard({
  orderId,
  resourceId,
  holderName,
}: {
  orderId: string;
  resourceId: string;
  holderName: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (done) {
    return <span style={{ fontSize: 12, color: "var(--st-pickup-text)", flexShrink: 0 }}>已提意向</span>;
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/provider/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, resource_id: resourceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "没提上，再试一次");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("网络没通，再试一次");
    } finally {
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        style={{ ...cancelStyle, fontSize: 13, color: "var(--link)", flexShrink: 0 }}
      >
        我可以接 →
      </button>
    );
  }

  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
      {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
      <button type="button" disabled={busy} onClick={submit} style={buttonStyle}>
        {busy ? "提交中…" : `用 ${holderName} 提`}
      </button>
      <button type="button" onClick={() => setArmed(false)} style={cancelStyle}>
        取消
      </button>
    </span>
  );
}
