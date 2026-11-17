"use client";

import { useEffect, useRef, useState } from "react";
import type { DropOption } from "@/lib/dropPerson";
import { rescaleAmount } from "@/lib/pricing";

/** 「⋯」按钮的样子。OptimisticAssign 抢画的那条也摆一个一样的，真条接上时不横着跳 */
export const MORE_BUTTON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  padding: "0 8px",
  border: "1px solid rgba(255,255,255,0.5)",
  borderRadius: 4,
  background: "transparent",
  color: "var(--on-solid)",
  fontSize: 14,
  lineHeight: "20px",
};

/**
 * 分配浮动条上的「⋯」：不常用的快捷操作收在这里。现在只有「少几个人」——
 * 客人说原来四个人、现在只来两个：勾上不来的那几个（配了资源的按资源认人），点确定，
 * 人数减掉、金额按比例减、配给他们的资源退回去，一下做完。
 *
 * 菜单挂在浮动条（data-assign-bar）里面，点它不会被 InstantAssign 当成「点空白处退出」。
 */
export default function MoreMenu({
  options,
  party,
  amount,
  onPick,
}: {
  options: DropOption[];
  /** 现在几个人：至少留一个人，勾到只剩一个就不让再勾 */
  party: number;
  /** 现在的总价：确定按钮上显示减完是多少 */
  amount: number | string | null;
  onPick: (opts: DropOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLSpanElement>(null);

  // 点菜单外面收起来
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const chosen = options.filter((o) => picked.has(o.key));
  const full = party - chosen.length <= 1;
  const oldAmount = amount == null || amount === "" ? null : Number(amount);
  // 天数不变，按人数比例（服务端用同一个函数按天数 × 人数算）
  const newAmount = rescaleAmount(oldAmount, { days: 1, party }, { days: 1, party: party - chosen.length });

  return (
    <span ref={ref} style={{ position: "relative", flexShrink: 0, display: "flex" }}>
      <button
        type="button"
        aria-label="更多操作"
        title="更多操作"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setPicked(new Set());
        }}
        style={{ ...MORE_BUTTON_STYLE, background: open ? "rgba(255,255,255,0.2)" : "transparent", cursor: "pointer" }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 220,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            padding: 4,
            zIndex: 60,
          }}
        >
          <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            少几个人：勾上不来的（金额按人数比例减）
          </div>
          {options.length === 0 ? (
            <div style={{ padding: "6px 8px", fontSize: 12, color: "var(--text-muted)" }}>
              只剩一个人了，不要了就删单
            </div>
          ) : (
            <>
              {options.map((o) => {
                const on = picked.has(o.key);
                const disabled = !on && full;
                return (
                  <label
                    key={o.key}
                    title={disabled ? "至少留一个人 —— 都不来了就删单" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.45 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.key)) next.delete(o.key);
                          else next.add(o.key);
                          return next;
                        })
                      }
                      style={{ margin: 0 }}
                    />
                    {o.label}
                  </label>
                );
              })}
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => {
                  setOpen(false);
                  onPick(chosen);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "5px 8px",
                  border: "none",
                  borderRadius: 4,
                  background: chosen.length === 0 ? "var(--surface-2)" : "var(--link)",
                  color: chosen.length === 0 ? "var(--text-faint)" : "var(--on-solid)",
                  fontSize: 12,
                  cursor: chosen.length === 0 ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {chosen.length === 0
                  ? "先勾要少的人"
                  : `少 ${chosen.length} 个人` +
                    (oldAmount != null && newAmount != null ? `，金额 $${oldAmount} → $${newAmount}` : "")}
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
