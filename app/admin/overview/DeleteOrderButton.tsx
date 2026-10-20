"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 分配模式里的删单红叉：真删库（配的资源、收款记录跟着级联删掉），所以点之前弹窗确认一下。
//
// 删除本身要等 Supabase 一个来回（实测这台机器上一个来回就要 0.9 秒左右），再加上
// 删完重新渲染整页，老老实实等下来要两三秒，点完像卡住一样。所以这里改成乐观更新：
// 确认之后立刻把这个单子的色块藏掉、退出分配模式，删库和刷新在后台跑；万一失败了
// 再把色块显示回来并提示。
export default function DeleteOrderButton({
  orderId,
  deleteAction,
  style,
  /** 按钮文字。默认是那个红叉；浮动条上地方够，写成「删除这单」更清楚 */
  label = "×",
  onStart,
}: {
  orderId: string;
  deleteAction: (formData: FormData) => Promise<void>;
  style?: React.CSSProperties;
  label?: string;
  /** 确认删除的那一刻（分配态退出、**不存**改动：单子都要没了，存了也会报错） */
  onStart?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  // 同一个订单可能有好几个色块（日期不连续、或者被 4 周的段边界切开），全都要藏
  function setBlocksHidden(hidden: boolean) {
    document
      .querySelectorAll<HTMLElement>(`[data-order-id="${orderId}"]`)
      .forEach((el) => {
        el.style.display = hidden ? "none" : "";
      });
  }

  async function handleDelete() {
    if (deleting) return;
    if (!confirm("确定删除这个订单？配的资源、收款记录会一起删掉，不能撤销。")) return;

    setDeleting(true);
    onStart?.();
    setBlocksHidden(true);
    // 退出分配态由 onStart 在浏览器里做完（InstantAssign 的 exit），这里**不能再 router.push**：
    // 导航和紧跟着的 Server Action 挤在一起，Action 被 Next 的路由队列丢掉，删除请求根本没发出去
    // —— 色块当场藏了、看着删掉了，一刷新又回来（2026-10-20 线上抓到的）

    const fd = new FormData();
    fd.set("order_id", orderId);
    try {
      await deleteAction(fd);
      router.refresh();
    } catch {
      setBlocksHidden(false);
      setDeleting(false);
      alert("删除失败，请重试");
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      title="删除这个订单"
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--danger)",
        fontSize: 14,
        lineHeight: 1,
        fontWeight: 700,
        ...style,
      }}
    >
      {deleting ? "删除中…" : label}
    </button>
  );
}
