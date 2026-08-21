"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 只要是"离开当前这单的编辑"——点外面空白、按 Esc、点了另一个订单、点了导航栏——
// 都算确认：自动保存改过的字段（客人姓名/地点/男女人数/状态/总价）。不需要专门的
// "存/更新"按钮。
//
// 保存用 sendBeacon 打 save-field 这个 Route Handler，不等响应就直接跳转。
// 之前用 Server Action + await 的做法："发出去就不管"会被 Next 的客户端路由在新
// 导航开始时直接 abort 掉（亲测：请求发出去了，服务端函数体从没执行过）；等它
// 写完再跳转又要等 1~3 秒，体验很资源。sendBeacon 是浏览器专门为这种"要跳走了但
// 这个请求必须送达"场景设计的，两个问题一次解决——只是拿不到响应，出错了也不会
// 有提示，这是可以接受的取舍。
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
    function saveChangedEdits() {
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
      navigator.sendBeacon(
        "/admin/overview/save-field",
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    }

    function handleClick(e: MouseEvent) {
      if (document.body.dataset.resizingOrder) return;
      const target = e.target as HTMLElement;
      if (target.closest("#assign-active-block")) return;
      if (target.closest("#resource-panel")) return;

      const link = target.closest("a") as HTMLAnchorElement | null;
      if (link) {
        // 点的是链接（另一个订单、导航栏……）：自己接管这次跳转，
        // 保证保存的 beacon 在跳转前已经发出去
        e.preventDefault();
        saveChangedEdits();
        router.push(link.getAttribute("href") || exitHref);
        return;
      }
      if (target.closest("button, select, input, form")) return;

      // 点的是空白处：自己没有默认导航行为，手动退出分配模式
      saveChangedEdits();
      router.push(exitHref);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      saveChangedEdits();
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
