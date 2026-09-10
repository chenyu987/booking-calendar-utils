"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 配一个资源 / 撤一个资源的按钮。打 /admin/overview/assign 这个 Route Handler，
// 不走 Server Action —— Server Action 末尾那个 redirect() 会把整页渲染
// （实测 0.6~1.3s）挂在每次点击的关键路径上。
//
// **这里是「诚实的等待」，不是乐观更新**：点下去按钮立刻变成「分配中…」，
// 你马上知道点到了，但界面在服务端确认之前不会显示「已配上」。
// 分配有三条服务端校验（卡在出租中 / 有效期覆盖订单全部日期 / 同一个资源同一天
// 不能配给两个订单），第三条还依赖别的订单的数据——先认下来再回滚的话，
// 撤销那一下很容易被人错过，而物品是登记了使用人的，以为配上了其实没配上，
// 人到核验前才发现，代价太大。
export function useAssignCall() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fuse = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(fuse.current), []);

  const run = useCallback(
    async (body: { order_id: string; resource_id: string; op: "add" | "remove" }) => {
      if (pending) return;
      setPending(true);
      setError(null);
      // 保险丝：成功之后这个组件通常会被新一轮渲染替换掉，pending 自然消失。
      // 万一没被替换（刷新失败之类），别让按钮永远卡在「分配中」点不动。
      fuse.current = setTimeout(() => setPending(false), 8000);

      const stop = () => {
        clearTimeout(fuse.current);
        setPending(false);
      };

      try {
        const res = await fetch("/admin/overview/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "操作失败");
          stop();
          return;
        }
        // 写库已经完成了，整页刷新丢到后台，不挡着人接着配下一张
        router.refresh();
      } catch {
        setError("网络出错，没有改动");
        stop();
      }
    },
    [pending, router]
  );

  return { pending, error, dismiss: () => setError(null), run };
}

// 失败必须看得见：钉在顶上、红的、不自动消失，得手动关掉。
// 配错资源的代价（人到核验前过不去）比多点一下关提示大得多。
export function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(90vw, 560px)",
        padding: "8px 14px",
        background: "var(--danger)",
        color: "var(--on-solid)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(185,28,28,0.45)",
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        title="知道了"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: 4,
          color: "var(--on-solid)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function AssignResourceButton({
  orderId,
  resourceId,
  style,
}: {
  orderId: string;
  resourceId: string;
  style: React.CSSProperties;
}) {
  const { pending, error, dismiss, run } = useAssignCall();
  return (
    <>
      {error && <ErrorToast message={error} onClose={dismiss} />}
      <button
        type="button"
        disabled={pending}
        onClick={() => run({ order_id: orderId, resource_id: resourceId, op: "add" })}
        style={{
          ...style,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "分配中…" : "配这单"}
      </button>
    </>
  );
}

export function UnassignButton({
  orderId,
  resourceId,
  style,
  className,
}: {
  orderId: string;
  resourceId: string;
  style: React.CSSProperties;
  /** 平时藏起来、鼠标移到这个资源上才浮出来 —— 那条 :hover 规则在 app/layout.tsx */
  className?: string;
}) {
  const { pending, error, dismiss, run } = useAssignCall();
  return (
    <>
      {error && <ErrorToast message={error} onClose={dismiss} />}
      <button
        type="button"
        className={className}
        disabled={pending}
        title={pending ? "撤销中…" : "撤销这个资源"}
        onClick={() => run({ order_id: orderId, resource_id: resourceId, op: "remove" })}
        // opacity 只在「撤销中」时写死。平时**不能**写 opacity: 1 ——
        // 内联样式盖过 class，分配态那个「平时藏起来、hover 才出现」的规则
        // （.assign-card-x，见 app/layout.tsx）就永远生效不了
        style={{
          ...style,
          cursor: pending ? "default" : "pointer",
          ...(pending ? { opacity: 0.4 } : null),
        }}
      >
        {pending ? "·" : "×"}
      </button>
    </>
  );
}

/**
 * 输入物主名字分配。分配时不用非得到左边一长串里去找、去点。
 *
 * 走的是跟「配这单」完全同一条路（同一个 Route Handler、同一套等待和报错），
 * 所以服务端那四条校验一条不少 —— 这里只是把「点得到」换成「叫得出」。
 *
 * 候选只列当前真能配的资源（过了四条校验、这个性别还有缺口），推荐的排最前面，
 * 所以打字的过程本身就是在筛选。
 */
export function AssignByNameInput({
  orderId,
  candidates,
}: {
  orderId: string;
  candidates: { id: string; name: string; hint: string }[];
}) {
  const { pending, error, dismiss, run } = useAssignCall();
  const [value, setValue] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);
  const listId = `assign-by-name-${orderId}`;

  // 打一半就能回车。原生 datalist 要「↓ 选中 → Enter 填入 → 再 Enter 提交」三下，
  // 太笨；只要打的字能唯一确定一个资源，回车就直接配上。
  //
  // 顺序：完全相同 > 前缀 > 包含。**唯一确定才算数** —— 匹配到多张就不动，
  // 让人再多打几个字。配错资源的代价是人到核验前过不去，不能猜。
  const typed = value.trim().toLowerCase();
  const matches = (() => {
    if (!typed) return [];
    const exact = candidates.filter((c) => c.name.toLowerCase() === typed);
    if (exact.length > 0) return exact;
    const prefix = candidates.filter((c) => c.name.toLowerCase().startsWith(typed));
    if (prefix.length > 0) return prefix;
    return candidates.filter((c) => c.name.toLowerCase().includes(typed));
  })();
  const resolved = matches.length === 1 ? matches[0] : null;

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!value.trim() || pending) return;
    if (!resolved) {
      setNotFound(value.trim());
      return;
    }
    setNotFound(null);
    setValue("");
    run({ order_id: orderId, resource_id: resolved.id, op: "add" });
  }

  return (
    <>
      {error && <ErrorToast message={error} onClose={dismiss} />}
      <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <datalist id={listId}>
          {candidates.map((c) => (
            <option key={c.id} value={c.name}>
              {c.hint}
            </option>
          ))}
        </datalist>
        <input
          list={listId}
          value={value}
          disabled={pending || candidates.length === 0}
          onChange={(e) => {
            setValue(e.target.value);
            setNotFound(null);
          }}
          // 自己接管回车：datalist 的下拉会把第一次回车吃掉（那一下用来选中建议项），
          // 表单的隐式提交就永远等不到。实测过，不是猜的。
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            candidates.length === 0 ? "没有可配的资源" : `输入物主名字（${candidates.length} 张可配）`
          }
          title={
            notFound
              ? `没有叫「${notFound}」的资源可以配这一单`
              : "打一半就行，能唯一对上一个资源时回车直接配上"
          }
          style={{
            width: 190,
            fontSize: 12,
            padding: "3px 6px",
            borderRadius: 4,
            border: notFound ? "1px solid #ffb3ab" : "1px solid rgba(255,255,255,0.45)",
            background: notFound ? "#fff2f0" : "rgba(255,255,255,0.12)",
            color: notFound ? "var(--danger)" : "var(--on-solid)",
          }}
        />
        <button
          type="submit"
          disabled={pending || candidates.length === 0}
          style={{
            fontSize: 12,
            padding: "3px 8px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.45)",
            background: "transparent",
            color: "var(--on-solid)",
            cursor: pending ? "default" : "pointer",
            opacity: pending || candidates.length === 0 ? 0.5 : 1,
          }}
        >
          {pending ? "分配中…" : "配上"}
        </button>
        {/* 回车会配哪张，当场说清楚，不让人猜 */}
        {!pending && typed && resolved && (
          <span style={{ fontSize: 12, opacity: 0.9, whiteSpace: "nowrap" }}>
            → {resolved.name}
          </span>
        )}
        {!pending && typed && !resolved && matches.length > 1 && (
          <span style={{ fontSize: 12, color: "#ffe6a3", whiteSpace: "nowrap" }}>
            {matches.length} 张都对得上，再多打几个字
          </span>
        )}
        {!pending && typed && matches.length === 0 && (
          <span style={{ fontSize: 12, color: "#ffd9d4", whiteSpace: "nowrap" }}>
            没这个资源
          </span>
        )}
      </form>
    </>
  );
}
