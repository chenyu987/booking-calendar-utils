"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import AssignEditor, { type EditorData } from "./AssignEditor";
import { collectChangedEdits } from "./ClickOutsideDeselect";
import AssigningBar from "./AssigningBar";
import { getPanelData, setInstantSelection } from "./assignSelection";
import { nameCandidates } from "@/lib/assignPanel";

// 点色块**当场**就是分配态：能打字、能改状态，不等整页渲染。
//
// 进分配态是一次真的服务端导航（?assign=<id>），整页渲染回来要一秒多（25-26 季 1800 单，
// 2026-10-14 实测 1.2~1.4 秒）。原来这段时间里只有 OptimisticAssign 抢画的一圈光和假浮动条，
// 色块里的编辑框要等服务端。现在按下去的同一帧，就在**同一个格子**里画上**同一个**编辑框
// （AssignEditor，服务端也用它），把原来那段普通态藏起来；服务端那一份到了，把打的字、
// 光标搬过去，自己撤掉。
// 左边资源清单和顶上浮动条也是当场的：清单看 assignSelection（这里点下去就写进去），
// 浮动条这里直接画一份（同一个 AssigningBar），候选跟服务端同一个算法（lib/assignPanel.ts）。
//
// 命令式的东西都有撤销点（CLAUDE.md「命令式改了 DOM 就得自己负责撤」）：
//   - 藏普通态那段用的是注入一条 CSS 规则，跟节点生死无关；active 一清就没了
//   - 编辑框是 portal 进日历 grid 的，React 管它的生死
//   - 撤的时机：服务端那份接上 / Esc / 点空白退出

export type InstantEditors = Record<string, EditorData & { band: number }>;

export default function InstantAssign({
  editors,
  bandDays,
  exitHref,
  deleteAction,
}: {
  editors: InstantEditors;
  bandDays: string[][];
  exitHref: string;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  // 点下去那一刻这一单的数据，**存一份快照**。不能每次从 editors 里现取：服务端那份回来的
  // 同一次渲染里，这一单已经在分配态、不在 editors 里了 —— 现取的话当场画的那份跟着就没了，
  // 打的字还没来得及搬过去（e2e 那条「打的字接上之后还在」就是这么抓到的）
  const [snapshot, setSnapshot] = useState<(EditorData & { band: number }) | null>(null);
  const editorsRef = useRef(editors);
  editorsRef.current = editors;

  // 点下去：同一帧画上编辑框。
  // **挂在 click 上，不挂 pointerdown**：按下去就画的话，编辑框盖住了链接，抬手落在编辑框上，
  // 浏览器的 click 就落到两者共同的祖先（日历 grid）上 —— 链接收不到点击，根本不导航，
  // 上一单的 ClickOutsideDeselect 还会当成「点了空白」退出。等 click 到了再画：
  // 链接照常导航（或者被上一单的 ClickOutsideDeselect 接管：先存再跳），这里只管画。
  // 按下去那一下的即时反馈（光圈、假浮动条）还是 OptimisticAssign 在 pointerdown 上给。
  // 监听挂在 document 冒泡阶段，排在 React 和 ClickOutsideDeselect（捕获阶段）之后
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.("a[data-order-id]") as HTMLElement | null;
      if (!el) return;
      // 修饰键和中键是「新标签页打开 / 多选」，当前页面不进分配态
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const id = el.dataset.orderId;
      if (!id || !editorsRef.current[id]) return;
      // flushSync：监听不是 React 的事件，不 flush 的话要等下一帧
      flushSync(() => {
        setActive(id);
        setSnapshot(editorsRef.current[id]);
        // 左边资源清单当场换成这一单的（ResourcePanel 看 assignSelection），同一帧画
        setInstantSelection(id);
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // 撤掉当场画的那份时，「当场选中」也一起清掉，资源清单退回看服务端的 ?assign=
  useEffect(() => {
    if (!active) setInstantSelection(null);
  }, [active]);
  useEffect(() => () => setInstantSelection(null), []);

  // 服务端那一份到了：把打的字、光标搬过去，自己撤掉
  useEffect(() => {
    if (!active) return;
    const id = active;
    const handover = (sync: boolean) => {
      const real = document.querySelector(`[data-assign-editor="${CSS.escape(id)}"]:not([data-instant])`);
      // 编辑框和浮动条都到了才交接：两样一起撤，打的字两边都得搬
      const realBarReady = document.querySelector(`[data-assign-bar="${CSS.escape(id)}"]:not([data-instant])`);
      if (!real || !realBarReady) return false;
      const ours = document.querySelector(`[data-assign-editor="${CSS.escape(id)}"][data-instant]`);
      if (ours) moveEdits(ours, real);
      // 浮动条同理：「打名字分配」「备注」打了一半的字搬到服务端那条上
      const oursBar = document.querySelector(`[data-assign-bar="${CSS.escape(id)}"][data-instant]`);
      const realBar = document.querySelector(`[data-assign-bar="${CSS.escape(id)}"]:not([data-instant])`);
      if (oursBar && realBar) moveBarEdits(oursBar, realBar);
      // flushSync：**就在这个回调里**把当场画的那份撤掉。不 flush 的话 React 要等下一轮才删，
      // 中间有一小段两份编辑框同时在页面上 —— CI 机器慢，e2e 正好在这一段里查到两个
      // customer_name 输入框（strict mode violation，2026-10-14 合进 main 后的那次 CI）。
      // MutationObserver 的回调在服务端那份插进来之后、任何别的任务之前跑，这里同步删掉，
      // 别的代码就永远看不到两份并存
      // （effect 里直接调的那一次不 flush —— 在 effect 里 flushSync 会被 React 警告，
      // 而且那时候服务端那份本来就已经在了，不存在「中间那一段」）
      const clear = () => setActive((cur) => (cur === id ? null : cur));
      if (sync) flushSync(clear);
      else clear();
      return true;
    };
    if (handover(false)) return;
    const mo = new MutationObserver(() => {
      if (handover(true)) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [active]);

  // 服务端那份还没到就要退出：Esc = 取消；点空白 = 存了再退（跟 ClickOutsideDeselect 同一个规矩）。
  // 已经在别的单的分配态里时，那一单的 ClickOutsideDeselect 也会处理这一下，两边都是退出，不冲突
  useEffect(() => {
    if (!active) return;
    const id = active;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setActive(null);
      router.push(exitHref);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (document.body.dataset.resizingOrder) return;
      if (t.closest(`[data-assign-editor="${CSS.escape(id)}"]`)) return;
      // 链接（别的单、导航栏）、表单控件、资源面板、浮动条：各有各的去处，不在这儿退出
      if (t.closest("a, button, select, input, form, #resource-panel, [data-assign-bar], [aria-hidden]")) return;
      const ours = document.querySelector(`[data-assign-editor="${CSS.escape(id)}"][data-instant]`);
      const payload = collectChangedEdits(ours);
      setActive(null);
      const exit = () => {
        router.push(exitHref);
        router.refresh();
      };
      if (Object.keys(payload).length === 0) return exit();
      fetch("/admin/overview/save-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, order_id: id }),
      }).then(exit, exit);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [active, exitHref, router]);

  const d = active && snapshot?.orderId === active ? snapshot : null;
  // 浮动条「打名字分配」的候选：跟服务端同一个算法，点哪单算哪单
  // 数据跟资源清单共用一份（ResourcePanel 登记在 assignSelection 里），不另传
  const candidates = useMemo(() => {
    const data = getPanelData();
    const order = d && data?.orders[d.orderId];
    return order ? nameCandidates(order, data!.allResources, data!.bookedDays, data!.history) : [];
  }, [d]);
  if (!d) return null;
  const grid = document.querySelector(`[data-band-grid="${d.band}"]`);
  if (!grid) return null;
  // id 是 UUID，过一道白名单再拼进选择器
  const safeId = /^[A-Za-z0-9-]+$/.test(d.orderId) ? d.orderId : null;

  return (
    <>
      {/* 原来那段普通态藏起来（只藏放编辑控件的那一段；别的段照常显示、跟着亮光圈）。
          注入 CSS 规则而不是改节点：跟节点生死无关，active 一清就撤。
          必须走 dangerouslySetInnerHTML，见 CLAUDE.md */}
      {safeId && (
        <style
          dangerouslySetInnerHTML={{
            __html: `a[data-order-id="${safeId}"][data-edit-seg]{visibility:hidden}`,
          }}
        />
      )}
      {createPortal(
        <AssignEditor d={d} timeline={bandDays[d.band] ?? []} exitHref={exitHref} instant />,
        grid
      )}
      {/* 顶上浮动条，跟服务端那条同一个组件 */}
      <AssigningBar
        orderId={d.orderId}
        label={[d.customerName, d.location].filter(Boolean).join(" · ")}
        note={d.note}
        candidates={candidates}
        deleteAction={deleteAction}
        exitHref={exitHref}
        instant
      />
    </>
  );
}

/**
 * 当场画的那份里打的字，搬到服务端那份上：只搬改过的（值跟 data-original 不一样），
 * 正在打字的那个框把焦点和光标位置也搬过去 —— 不然接上那一刻光标丢了，字打一半断掉
 */
function moveEdits(from: Element, to: Element) {
  const focused = document.activeElement as HTMLInputElement | HTMLSelectElement | null;
  const focusName = focused && from.contains(focused) ? focused.getAttribute("name") : null;
  let caret: [number | null, number | null] = [null, null];
  try {
    if (focused instanceof HTMLInputElement) caret = [focused.selectionStart, focused.selectionEnd];
  } catch {
    // number 输入框不让读光标位置
  }

  from.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach((src) => {
    if (src.type === "hidden") return;
    const name = src.getAttribute("name")!;
    if (src.value === (src.dataset.original ?? "")) return;
    const dst = to.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${CSS.escape(name)}"]:not([type="hidden"])`);
    if (!dst) return;
    // 直接改 .value 的话 React 不认（它记着上一次的值），走原生 setter 再补事件
    const proto = dst instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(dst, src.value);
    dst.dispatchEvent(new Event("input", { bubbles: true }));
    dst.dispatchEvent(new Event("change", { bubbles: true }));
  });

  if (focusName) {
    const dst = to.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${CSS.escape(focusName)}"]:not([type="hidden"])`);
    dst?.focus();
    if (dst instanceof HTMLInputElement && caret[0] !== null) {
      try {
        dst.setSelectionRange(caret[0], caret[1]);
      } catch {
        // number 输入框不支持 setSelectionRange
      }
    }
  }
}

/** 浮动条里打了一半的字（打名字分配、备注）：按顺序一一对应搬过去，焦点也搬 */
function moveBarEdits(from: Element, to: Element) {
  const src = [...from.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")];
  const dst = [...to.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")];
  const focusedIdx = src.findIndex((el) => el === document.activeElement);
  src.forEach((el, i) => {
    const target = dst[i];
    // 不能拿 defaultValue 判断「打没打过字」：受控输入框（打名字分配那个）React 会把
    // value 同步到 defaultValue 上，永远相等。跟服务端那条比，不一样就搬
    if (!target || el.value === target.value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(target, el.value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (focusedIdx >= 0) dst[focusedIdx]?.focus();
}
