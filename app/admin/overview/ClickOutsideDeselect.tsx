"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 点分配色块和 Resource 面板之外的地方，自动保存当前正在编辑的状态/总价，然后退出分配模式。
// 用 Link 做不到这件事（点击外部不对应任何链接），只能上一点客户端 JS。
export default function ClickOutsideDeselect({
  exitHref,
  orderId,
  updateAmountAction,
  updateStatusAction,
}: {
  exitHref: string;
  orderId: string;
  updateAmountAction: (formData: FormData) => Promise<void>;
  updateStatusAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();

  useEffect(() => {
    async function handleClick(e: MouseEvent) {
      if (document.body.dataset.resizingOrder) return;
      const target = e.target as HTMLElement;
      if (target.closest("#assign-active-block")) return;
      if (target.closest("#resource-panel")) return;
      if (target.closest("a, button, select, input, form")) return;

      const block = document.getElementById("assign-active-block");
      const amountInput = block?.querySelector<HTMLInputElement>('input[name="amount"]');
      const statusSelect = block?.querySelector<HTMLSelectElement>('select[name="status"]');

      const saves: Promise<void>[] = [];
      if (amountInput) {
        const fd = new FormData();
        fd.set("order_id", orderId);
        fd.set("amount", amountInput.value);
        saves.push(updateAmountAction(fd));
      }
      if (statusSelect) {
        const fd = new FormData();
        fd.set("order_id", orderId);
        fd.set("status", statusSelect.value);
        saves.push(updateStatusAction(fd));
      }
      if (saves.length > 0) await Promise.all(saves);

      router.push(exitHref);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [exitHref, orderId, updateAmountAction, updateStatusAction, router]);

  return null;
}
