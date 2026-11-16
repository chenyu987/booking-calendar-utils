"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAddressShort, type Address } from "@/lib/address";
import { saveProviderAddress } from "./actions";

// 「物主地址」那一格：平时只是一行「城市, 州 邮编」，点一下浮出三个小框（城市 / 州 / 邮编）当场改。
// 浮层跟排期那一格一样用 <details>（样式是页面上的 .bk / .bk-pop），不占表格的宽度。
//
// 改的是**物主这个人**的地址（people 上），他名下每个资源那一格一起变 —— 浮层里写明了。
// 存好先把这一格画成新值，再 router.refresh() 让同一个物主的其它行跟上。
export default function ProviderAddress({
  providerId,
  providerName,
  cardCount,
  address,
}: {
  providerId: string;
  providerName: string;
  /** 这位物主名下几个资源（浮层里提示「N 个资源一起变」） */
  cardCount: number;
  address: Address | null;
}) {
  const router = useRouter();
  const [shown, setShown] = useState<Address | null>(address);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const short = formatAddressShort(shown);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const details = form.closest("details");
    const fd = new FormData(form);
    setError(null);
    start(async () => {
      const r = await saveProviderAddress(fd);
      if (r.error) {
        setError(r.error); // 浮层不收，刚才打的字留着
        return;
      }
      const v = (k: string) => String(fd.get(k) ?? "").trim() || null;
      setShown({ ...shown, city: v("city"), region: v("region"), postal_code: v("postal_code") });
      details?.removeAttribute("open");
      router.refresh();
    });
  }

  const input = { padding: "3px 5px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" as const };

  return (
    <details className="bk">
      <summary
        title={short ? `${short}（点一下改）` : "还没填，点一下填"}
        style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {short ?? <span style={{ color: "var(--text-faint)" }}>-</span>}
      </summary>
      <form className="bk-pop" onSubmit={submit} style={{ minWidth: 0, whiteSpace: "normal" }}>
        <input type="hidden" name="provider_id" value={providerId} />
        <div style={{ display: "flex", gap: 4 }}>
          <input name="city" defaultValue={shown?.city ?? ""} placeholder="城市" style={{ ...input, width: 110 }} autoFocus />
          <input name="region" defaultValue={shown?.region ?? ""} placeholder="州" style={{ ...input, width: 56 }} />
          <input name="postal_code" defaultValue={shown?.postal_code ?? ""} placeholder="邮编" style={{ ...input, width: 76 }} />
          <button type="submit" disabled={pending} style={{ ...input, cursor: "pointer", background: "var(--text)", color: "var(--bg)", border: "none" }}>
            {pending ? "存…" : "存"}
          </button>
        </div>
        <div style={{ marginTop: 4, color: error ? "var(--danger, crimson)" : "var(--text-faint)", fontSize: 11 }}>
          {error ?? `改的是物主 ${providerName} 的地址${cardCount > 1 ? `，名下 ${cardCount} 个资源一起变` : ""}`}
        </div>
      </form>
    </details>
  );
}
