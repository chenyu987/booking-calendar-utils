"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CustomerHistory } from "@/lib/customerHistory";

// 排期总览普通态色块：鼠标停在客人名字上，浮出这个人以前（和以后）的单子、当时配的是谁的资源。
//
// 数据是悬停时现拿的（customer-history 路由）：总览一次只读一季，历史在别的季里；
// 往整季那批数据里给每单塞一份历史，一千八百单绝大多数永远没人看。
// 拿过的记一会儿（CACHE_MS），在几个色块之间来回扫不重复打库；改了单子过一分钟也就新了。
//
// 只包名字那几个字，不动色块的几何：外面套的是一个**不带任何样式**的 span。
// 名字上挂 title=""：空的 title 会挡住外面色块那条原生悬停说明，不然两个浮层叠在一起。

const DELAY_MS = 250;
const CACHE_MS = 60_000;
const MAX_ENTRIES = 12;

const cache = new Map<string, { at: number; p: Promise<CustomerHistory> }>();

function load(customerId: string, orderId: string): Promise<CustomerHistory> {
  const key = `${customerId}:${orderId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p;
  const p = fetch(
    `/admin/overview/customer-history?customer=${encodeURIComponent(customerId)}&order=${encodeURIComponent(orderId)}`
  ).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
    return r.json();
  });
  // 失败的不留：下次悬停再试
  p.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), p });
  return p;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: CustomerHistory };

export default function CustomerHistoryHover({
  customerId,
  orderId,
  children,
}: {
  customerId: string | null | undefined;
  orderId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAnchor(null);
  };
  useEffect(() => close, []);

  if (!customerId) return <>{children}</>;

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      setAnchor(el.getBoundingClientRect());
      setState({ kind: "loading" });
      load(customerId, orderId).then(
        (data) => setState({ kind: "ok", data }),
        (e) => setState({ kind: "error", message: String(e?.message ?? e) })
      );
    }, DELAY_MS);
  };

  return (
    <span
      ref={ref}
      data-customer-history="1"
      title=""
      onMouseEnter={open}
      onMouseLeave={close}
      // 按下去是进分配态 / 拖着挪日子，浮层别挡着
      onMouseDown={close}
    >
      {children}
      {anchor && typeof document !== "undefined" && createPortal(<Popover anchor={anchor} state={state} />, document.body)}
    </span>
  );
}

function Popover({ anchor, state }: { anchor: DOMRect; state: State }) {
  // 默认挂在名字下面；下面不够地方就挂上面。横向不出右边界
  const width = 340;
  const below = window.innerHeight - anchor.bottom > 260;
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
    ...(below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 }),
    width,
    maxHeight: 360,
    overflow: "hidden",
    boxSizing: "border-box",
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    boxShadow: "0 6px 20px rgba(0,0,0,.12)",
    color: "var(--text)",
    fontSize: 12,
    lineHeight: 1.6,
    fontWeight: 400,
    whiteSpace: "normal",
    zIndex: 1000,
    // 只看不点：鼠标移上去也不挡色块
    pointerEvents: "none",
  };
  return (
    <div data-customer-history-pop="1" style={style}>
      <Body state={state} />
    </div>
  );
}

function Body({ state }: { state: State }) {
  if (state.kind === "loading") return <div style={{ color: "var(--text-muted)" }}>查这个人以前的单子…</div>;
  if (state.kind === "error") return <div style={{ color: "var(--danger)" }}>没拿到历史：{state.message}</div>;
  const { data } = state;
  if (data.total === 0) return <div style={{ color: "var(--text-muted)" }}>新客户 · 除了这一单没有别的单子</div>;

  let left = MAX_ENTRIES;
  const hidden = Math.max(0, data.total - MAX_ENTRIES);
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {data.pastActive > 0 ? `老客户 · 以前用过 ${data.pastActive} 单` : "以前没真用过"}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>　共 {data.total} 单（不算这一单）</span>
      </div>
      {data.seasons.map((g) => {
        if (left <= 0) return null;
        const entries = g.entries.slice(0, left);
        left -= entries.length;
        return (
          <div key={g.season.key}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                marginTop: 4,
              }}
            >
              {g.season.label}
            </div>
            {entries.map((e) => (
              <div key={e.orderId} style={{ padding: "2px 0", opacity: e.inactive ? 0.55 : 1 }}>
                <div>
                  <span
                    style={{
                      color: e.inactive ? "var(--text-faint)" : "var(--link)",
                      textDecoration: e.inactive ? "line-through" : "none",
                    }}
                  >
                    {e.label}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {" · "}
                    {e.party} · {e.statusLabel}
                  </span>
                  {e.later && <span style={{ color: "var(--warn)" }}>{" · 这单之后"}</span>}
                </div>
                <div style={{ paddingLeft: 12, color: e.cards.length ? "var(--text)" : "var(--text-faint)" }}>
                  {e.cards.length === 0
                    ? "没分配"
                    : e.cards.map((c, i) => (
                        <span key={i}>
                          {i > 0 && "，"}
                          {c.gender === "male" ? "♂ " : c.gender === "female" ? "♀ " : ""}
                          {c.holder}
                        </span>
                      ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {hidden > 0 && <div style={{ color: "var(--text-muted)", marginTop: 2 }}>…还有 {hidden} 单，去 Customer 管理看足迹</div>}
    </>
  );
}
