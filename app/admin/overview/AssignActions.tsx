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
function useAssignCall() {
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
function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
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
        background: "#b91c1c",
        color: "#fff",
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
          color: "#fff",
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
        title={pending ? "撤销中…" : "撤销这个资源"}
        onClick={() => run({ order_id: orderId, resource_id: resourceId, op: "remove" })}
        style={{ ...style, cursor: pending ? "default" : "pointer", opacity: pending ? 0.4 : 1 }}
      >
        {pending ? "·" : "×"}
      </button>
    </>
  );
}
