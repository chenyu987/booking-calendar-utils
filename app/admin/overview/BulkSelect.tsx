"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS } from "@/lib/orderStatus";
import { BULK_SETTABLE_STATUSES } from "@/lib/bulkStatus";

// 多选 + 批量改状态。
//
// 为什么不做成「多个单子同时进入编辑态」：分配这个动作天生是单目标的
// （资源面板的「配这单」得知道配给谁），而且 ClickOutsideDeselect 靠
// getElementById("assign-active-block") 收集改动——同一个 id 出现多次，
// 后面几单的改动会被静默丢掉。所以这里把「选中」和「编辑」拆成两件事：
// 编辑还是单个（?assign=），选中纯粹是客户端状态，不进 URL、不发请求。
//
// 高亮的画法：**注入一条 CSS 规则**，而不是给 DOM 节点加 class。
// 色块是服务端渲染的，每次 router.refresh() 整片 DOM 都会被换掉，加在节点上的
// class 会跟着没；一条 [data-order-id="..."] 的选择器则跟节点的生死无关，
// 新渲染出来的节点自动就带上高亮。也省掉了 MutationObserver 那一套。
export default function BulkSelect() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(BULK_SETTABLE_STATUSES[0]);
  // shift 连选的锚点：上一次单独点中的那一单
  const anchorRef = useRef<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // 订单在日历上的先后：按最早的需求日排，同一天的按 id 排（稳定就行）。
  // 不用 DOM 顺序——DOM 里是按泳道排的，看起来在上面的不一定排在前面。
  const orderSequence = useCallback((): string[] => {
    const seen = new Map<string, string>();
    document
      .querySelectorAll<HTMLElement>("[data-order-id][data-order-start]")
      .forEach((el) => {
        const id = el.dataset.orderId!;
        const start = el.dataset.orderStart!;
        // 同一单可能画成好几段（跨 4 周折行、日期不连续），取最早那段
        const prev = seen.get(id);
        if (prev === undefined || start < prev) seen.set(id, start);
      });
    return [...seen.entries()]
      .sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : 1))
      .map(([id]) => id);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-order-id]");
      if (!el) return;
      const id = el.dataset.orderId;
      if (!id) return;

      const toggle = e.metaKey || e.ctrlKey;
      const range = e.shiftKey;
      if (!toggle && !range) return; // 普通点击照旧：进入这一单的编辑态

      // Cmd/Ctrl+点 在 <a> 上会开新标签页，Shift+点 会开新窗口——都得拦掉。
      // 用捕获阶段，赶在 Next 的 Link 处理之前。
      e.preventDefault();
      e.stopPropagation();
      setMsg(null);

      if (range && anchorRef.current) {
        const seq = orderSequence();
        const from = seq.indexOf(anchorRef.current);
        const to = seq.indexOf(id);
        if (from >= 0 && to >= 0) {
          const [lo, hi] = from <= to ? [from, to] : [to, from];
          const span = seq.slice(lo, hi + 1);
          setSelected((prev) => [...new Set([...prev, ...span])]);
          return;
        }
      }

      anchorRef.current = id;
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected([]);
        anchorRef.current = null;
        setMsg(null);
      }
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [orderSequence]);

  async function apply() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/overview/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: selected, status: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "改不动，再试一次");
      } else {
        setMsg(
          json.missing > 0
            ? `已改 ${json.updated} 单，另外 ${json.missing} 单找不到了（可能已被删除）`
            : `已改 ${json.updated} 单`
        );
        // 选中留着不清：改完能直接看到这批色块换了颜色，也方便接着做下一步
        router.refresh();
      }
    } catch {
      setMsg("网络出错，没有改动");
    } finally {
      setBusy(false);
    }
  }

  // uuid 之外的字符一律不拼进 CSS，避免选择器被脏数据带偏
  const safeIds = selected.filter((id) => /^[A-Za-z0-9-]+$/.test(id));
  const highlightCss =
    `@keyframes bulkbar-in{from{opacity:0;transform:translateY(-10px)}
      to{opacity:1;transform:none}}
     ` +
    (safeIds.length > 0
      ? `${safeIds.map((id) => `[data-order-id="${id}"]`).join(",")}{
           outline:2px solid var(--link);outline-offset:-2px;
           box-shadow:0 0 0 3px rgba(37,99,235,0.18);
         }`
      : "");

  return (
    <>
      {/* 跟 page.tsx 里那处一个道理：<style> 的文本子节点会被 React 转义，
          " 变成 &quot;，而 <style> 是 raw text 元素、浏览器不会还原，选择器就废了。
          这里的 id 已经过 /^[A-Za-z0-9-]+$/ 白名单，没有注入面。 */}
      <style dangerouslySetInnerHTML={{ __html: highlightCss }} />
      {selected.length > 0 && (
        <div
          // 外层只管定位。**动画不要挂在这一层**——动画一旦被冻住（比如标签页
          // 在后台，浏览器会把 CSS 动画停在第一帧）或者被打断，这条就会卡在
          // 起始那 12px 的偏移上，位置就错了。定位和动画分开，位置永远是对的。
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            // 贴顶不贴底：底部那一版在一屏日历的最下面，眼睛正盯着上面的单子，
            // 根本注意不到。顶上这一条标题行右边本来就是空的，挡不着东西。
            top: 8,
            zIndex: 50,
          }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 14px",
            // 用跟选中框一样的蓝，一眼看出这条和那几个蓝框是一回事
            background: "var(--link)",
            color: "var(--on-solid)",
            borderRadius: 999,
            boxShadow: "0 4px 16px rgba(29,78,216,0.45)",
            fontSize: 12,
            // 冒出来一下，余光也能扫到。只动 opacity 和一点点位移，
            // 而且是在内层，动不着外层那个定位
            animation: "bulkbar-in 160ms ease-out",
          }}
        >
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            已选 {selected.length} 单
          </span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span style={{ whiteSpace: "nowrap" }}>状态改为</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ fontSize: 12, padding: "2px 4px" }}
          >
            {BULK_SETTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={apply}
            disabled={busy}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "3px 14px",
              borderRadius: 999,
              border: "none",
              cursor: busy ? "default" : "pointer",
              background: busy ? "rgba(255,255,255,0.35)" : "var(--on-solid)",
              color: busy ? "var(--on-solid)" : "var(--link)",
            }}
          >
            {busy ? "改中…" : "应用"}
          </button>
          <button
            onClick={() => {
              setSelected([]);
              anchorRef.current = null;
              setMsg(null);
            }}
            style={{
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.45)",
              background: "transparent",
              color: "var(--on-solid)",
              cursor: "pointer",
            }}
          >
            清除
          </button>
          {msg && (
            <span style={{ opacity: 0.85, whiteSpace: "nowrap" }}>{msg}</span>
          )}
        </div>
        </div>
      )}
    </>
  );
}
