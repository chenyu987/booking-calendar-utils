"use client";

import { useState, type ReactNode } from "react";
import type { BookingPopupRow } from "@/lib/resourceBookings";

// 「排期」那一格：summary（第一单 … 最新一单 N 单）是服务端画好传进来的，
// 点开才去拿这个资源的全部明细（为什么见 lib/resourceBookings.ts）。拿过一次就留着，再点不再请求。
// 样式还是页面上那份 bookingCss（.bk / .bk-pop / .bk-pop-row）。
export default function BookingHistory({ resourceId, children }: { resourceId: string; children: ReactNode }) {
  const [rows, setRows] = useState<BookingPopupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (rows) return;
    setError(null);
    try {
      const res = await fetch(`/admin/resources/bookings?id=${encodeURIComponent(resourceId)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `读取失败（${res.status}）`);
      setRows(body.rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <details className="bk" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>{children}</summary>
      <div className="bk-pop">
        {error ? (
          <span style={{ color: "var(--danger, crimson)" }}>{error}</span>
        ) : !rows ? (
          <span style={{ color: "var(--text-faint)" }}>读取中…</span>
        ) : (
          rows.map((o) => (
            <div key={o.id} className="bk-pop-row">
              <span style={{ color: "var(--link)" }}>
                {o.days}
                <span style={{ color: "var(--text-faint)" }}> {o.year}</span>
              </span>
              <span>{o.location}</span>
              <span>{o.customer}</span>
              <span style={{ color: "var(--text-faint)" }}>{o.status}</span>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
