"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/globalSearch";

// 后台全局搜索：任何页按 ⌘K / Ctrl+K（或点侧边栏「搜索」）打开。
// 搜人（客户 / 物主）、订单（客户名字 + 备注）、资源（持有人）、需求（发言人 + 原文）；
// 不输字时列出各个页面，当快捷跳转用。↑↓ 选，回车跳过去，Esc 关。
// 查库在 /admin/search（Route Handler），这里只管框

type Page = { href: string; label: string };

export default function CommandPalette({ pages }: { pages: Page[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 停 200ms 再搜，打字时不连发；后发的请求回来之前，先发的结果不许盖上去
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      setPending(false);
      setError("");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const r = await fetch(`/admin/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { hits: SearchHit[] };
        setHits(body.hits);
        setError("");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("搜索出错了，再试一次");
      } finally {
        if (!ctrl.signal.aborted) setPending(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const pageHits: SearchHit[] = pages
    .filter((p) => !term || p.label.toLowerCase().includes(term))
    .map((p) => ({ group: "页面", title: p.label, sub: "", href: p.href }));
  const list = [...hits, ...pageHits];
  useEffect(() => setActive(0), [q, hits]);

  function open() {
    if (dialog.current?.open) return;
    dialog.current?.showModal();
    setTimeout(() => input.current?.select(), 0);
  }
  function go(h: SearchHit) {
    dialog.current?.close();
    setQ("");
    router.push(h.href);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing && list[active]) {
      // isComposing：中文输入法选字时按的回车不算
      e.preventDefault();
      go(list[active]);
    }
  }

  // 选中项跟着键盘滚进视野
  useEffect(() => {
    dialog.current?.querySelector(`[data-hit="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button type="button" onClick={open} style={triggerStyle} aria-label="搜索">
        搜索 <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{mac ? "⌘K" : "Ctrl K"}</span>
      </button>
      <dialog
        ref={dialog}
        aria-label="全局搜索"
        onClose={() => setQ("")}
        // 点框外面（dialog 自己，不是里面的内容）= 关
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        style={dialogStyle}
      >
        <div style={{ display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderBottom: "1px solid var(--border)" }}>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="搜昵称、账号、电话、邮箱、持有人、订单备注、需求"
              aria-label="搜索内容"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            {pending && <span style={{ color: "var(--text-faint)", fontSize: 12, whiteSpace: "nowrap" }}>搜索中…</span>}
          </div>
          <ul role="listbox" data-testid="search-results" style={{ listStyle: "none", margin: 0, padding: 6, overflowY: "auto" }}>
            {list.map((h, i) => (
              <li key={`${h.group}-${h.href}-${i}`} role="option" aria-selected={i === active}>
                {(i === 0 || list[i - 1].group !== h.group) && (
                  <div style={{ padding: "8px 8px 4px", fontSize: 12, color: "var(--text-faint)" }}>{h.group}</div>
                )}
                <button
                  type="button"
                  data-hit={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(h)}
                  style={{ ...hitStyle, background: i === active ? "var(--surface-2)" : "transparent" }}
                >
                  <span style={{ flexShrink: 0, fontWeight: 500 }}>{h.title}</span>
                  {h.sub && (
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-muted)" }}>
                      {h.sub}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {error && <li style={{ padding: "16px 8px", textAlign: "center", fontSize: 13, color: "var(--danger)" }}>{error}</li>}
            {q.trim() && !pending && !error && list.length === 0 && (
              <li style={{ padding: "16px 8px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>没搜到</li>
            )}
          </ul>
          <div style={{ display: "flex", gap: 16, padding: "6px 14px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-faint)" }}>
            <span>↑ ↓ 选</span>
            <span>Enter 打开</span>
            <span>Esc 关</span>
          </div>
        </div>
      </dialog>
    </>
  );
}

const triggerStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text)",
  // 跟导航项对齐：字号写死 14，字体族继承（同 SettingsTrigger）
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: "inherit",
  padding: 0,
  cursor: "pointer",
};

const dialogStyle: React.CSSProperties = {
  width: "min(600px, calc(100vw - 32px))",
  margin: "12vh auto auto",
  padding: 0,
  border: "1px solid var(--border-strong)",
  borderRadius: 10,
  background: "var(--surface)",
  color: "var(--text)",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 46,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 14,
};

const hitStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  width: "100%",
  padding: "7px 8px",
  border: "none",
  borderRadius: 6,
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
};
