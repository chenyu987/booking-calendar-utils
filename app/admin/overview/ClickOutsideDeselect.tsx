"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 离开当前这单的编辑——点外面空白、点了另一个订单、点了导航栏——都算确认：
// 自动保存改过的字段（客人姓名/地点/男女人数/状态/总价）。不需要专门的"存/更新"按钮。
// 只有 Esc 是真正的"取消"：改过的字段不保存，退回编辑前的样子。
//
// 保存前先 await 这次 fetch 再跳转，不是 sendBeacon 那种发了不等的打法：
// 之前用 Server Action 的做法，"发出去就不管"会被 Next 的客户端路由在新导航开始时
// 直接 abort 掉（亲测：请求发出去了，服务端函数体从没执行过）；这里改成先等这个
// Route Handler 真正写完库、revalidatePath 跑完，再 router.push 退出——这样退出后
// 立刻看到的就是新值，不会有"存了但页面还显示老数据"的空档。save-field 是个轻量
// Route Handler（不是 Server Action 那种要编译整个 action 的开销），这一下通常
// 很快，不会像之前 Server Action 那样资源到一两秒。
export default function ClickOutsideDeselect({
  exitHref,
  orderId,
}: {
  exitHref: string;
  orderId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // 只把真的改过的字段存回去，没动过的就不放进这次请求
    async function saveChangedEdits() {
      const block = document.getElementById("assign-active-block");
      const customerNameInput = block?.querySelector<HTMLInputElement>('input[name="customer_name"]');
      const locationInput = block?.querySelector<HTMLInputElement>('input[name="location"]');
      const maleInput = block?.querySelector<HTMLInputElement>('input[name="male_count"]');
      const femaleInput = block?.querySelector<HTMLInputElement>('input[name="female_count"]');
      const amountInput = block?.querySelector<HTMLInputElement>('input[name="amount"]');
      const statusSelect = block?.querySelector<HTMLSelectElement>('select[name="status"]');

      const payload: Record<string, string> = {};
      if (
        customerNameInput &&
        customerNameInput.value.trim() &&
        customerNameInput.value !== customerNameInput.dataset.original
      ) {
        payload.customer_name = customerNameInput.value;
      }
      if (locationInput && locationInput.value !== locationInput.dataset.original) {
        payload.location = locationInput.value;
      }
      if (
        maleInput &&
        femaleInput &&
        (maleInput.value !== maleInput.dataset.original ||
          femaleInput.value !== femaleInput.dataset.original)
      ) {
        payload.male_count = maleInput.value;
        payload.female_count = femaleInput.value;
      }
      if (amountInput && amountInput.value !== amountInput.dataset.original) {
        payload.amount = amountInput.value;
      }
      if (statusSelect && statusSelect.value !== statusSelect.dataset.original) {
        payload.status = statusSelect.value;
      }

      if (Object.keys(payload).length === 0) return;
      payload.order_id = orderId;
      await fetch("/admin/overview/save-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    function handleClick(e: MouseEvent) {
      if (document.body.dataset.resizingOrder) return;
      const target = e.target as HTMLElement;
      if (target.closest("#assign-active-block")) return;
      if (target.closest("#resource-panel")) return;

      const link = target.closest("a") as HTMLAnchorElement | null;
      if (link) {
        // 点的是链接（另一个订单、导航栏……）：自己接管这次跳转，
        // 等保存真正写完再跳，退出后看到的就是新值
        e.preventDefault();
        saveChangedEdits().then(() => router.push(link.getAttribute("href") || exitHref));
        return;
      }
      if (target.closest("button, select, input, form")) return;

      // 点的是空白处：自己没有默认导航行为，手动退出分配模式
      saveChangedEdits().then(() => router.push(exitHref));
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Esc 是真取消：不保存，直接退出，退回编辑前的样子
      router.push(exitHref);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [exitHref, orderId, router]);

  return null;
}
