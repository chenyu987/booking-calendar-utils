"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// 「点下去就当已经进分配模式了」。
//
// 进分配模式是一次真的服务端导航，这一页渲染一次 420ms（实测中位数；不管进不进
// 分配都是这个数，是整页的底价）。Next 在导航落地前一直显示旧页面，所以这
// 420ms 里点下去**什么反应都没有**，手感像卡住了。
//
// 这里不去抠那 420ms（要动得重排数据层），而是把那段空白填上：按下的一瞬间就
// 把分配模式的样子画出来——浮动条出现、这一单套上光圈——真界面 400 毫秒后无声
// 接上。人进了编辑态一般会先看一眼再动手，这 400ms 正好倒流进「进入」和
// 「下一个动作」中间，感觉上就没有了。
//
// 输入框是真能打字的：万一有人手快，打的字在真条挂上时原样搬过去，不丢。
export default function OptimisticAssign() {
  // 假条要显示的标题；null = 不显示
  const [label, setLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 抢画的那圈光**注入一条 CSS 规则**，不碰元素的内联样式。
  //
  // 这里踩过两次才想明白：
  //   1. 一开始直接写 el.style.boxShadow —— React 不知道它存在，服务端重渲染时
  //      节点复用，样式留着不走，退出分配态之后蓝边赖着不动。
  //   2. 于是加了个「撤销」去清 el.style.boxShadow —— 更糟：**React 的
  //      style={{}} 渲染出来就是内联样式**，清掉的其实是 React 自己画的那圈光，
  //      而它不会重画，结果分配态的色块整个没了蓝圈。
  // 注入 CSS 规则两个毛病都没有：跟节点的生死无关，也碰不到 React 那一份。
  // （BulkSelect 的高亮一直是这么干的，CLAUDE.md 里记了这条。）
  const [paintedId, setPaintedId] = useState<string | null>(null);
  // 真条上「加备注」那个框只在这单还没备注时才有。假条得跟着 ——
  // 不跟的话接管那一刻整条会横着跳一下，正是这层想消掉的那种毛躁
  const [needsNote, setNeedsNote] = useState(false);

  useEffect(() => {
    // 用 pointerdown 不用 click：按下就给反馈，不等抬手，能再抢出几十毫秒
    function onDown(e: PointerEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "a[data-order-id]"
      ) as HTMLElement | null;
      if (!el) return;
      // 修饰键和中键是「在新标签页打开」，当前页面不该有任何变化
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const id = el.dataset.orderId;
      if (!id) return;

      // flushSync：这个监听挂在 document 上，不是 React 的事件，setState 会被
      // 攒到下一帧才刷 —— 光圈立刻就有、浮动条晚一帧，两件事错开反而显得毛躁。
      // 这里正是 flushSync 该用的场合：同一次交互里要求同一帧画完
      // 同一个单子可能有好几个色块（日期不连续、被段边界切开），
      // 一条 [data-order-id] 的规则全都盖到，不用管有几个
      flushSync(() => {
        setPaintedId(id);
        setLabel(el.dataset.orderLabel || "…");
        setNeedsNote(el.dataset.orderHasNote !== "1");
      });

      // 兜底：导航要是没成（网断了、被别的导航顶掉了），假条不能一直挂着骗人
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLabel(null);
        setPaintedId(null);
      }, 8000);
    }

    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 真条一挂上就撤掉假条，并把手快打进去的字搬过去。
  // **认单号**：在分配态里点另一单时，旧那一单的真条还在 DOM 上，
  // 只判断「有没有真条」的话假状态会被立刻撤掉，换单就完全没有即时反馈了
  useEffect(() => {
    if (label === null || !paintedId) return;

    const handover = () => {
      const real = document.querySelector<HTMLElement>(
        `[data-assign-bar="${CSS.escape(paintedId)}"]`
      );
      if (!real) return false;
      const typed = inputRef.current?.value ?? "";
      setLabel(null);
      // 真界面到位了，抢画的规则撤掉，交还给服务端渲染的那一份
      setPaintedId(null);
      if (typed) {
        const realInput = real.querySelector("input");
        if (realInput) {
          // 直接改 .value 的话 React 不认（它记着上一次的值），得走原生 setter
          // 再补一个 input 事件，受控组件才会跟着更新
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )?.set;
          setter?.call(realInput, typed);
          realInput.dispatchEvent(new Event("input", { bubbles: true }));
          realInput.focus();
        }
      }
      return true;
    };

    if (handover()) return;
    const mo = new MutationObserver(() => {
      if (handover()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => mo.disconnect();
  }, [label, paintedId]);

  // id 是 UUID，过一道白名单再拼进选择器，没有注入面
  const safeId = paintedId && /^[A-Za-z0-9-]+$/.test(paintedId) ? paintedId : null;
  // !important 不能省：色块的 border 是 React 用内联 shorthand 写的
  // （border: 1px solid …），样式表里的 border-color 压不过内联
  const paintCss = safeId
    ? `[data-order-id="${safeId}"]{
         box-shadow:0 0 0 1px var(--link)!important;
         border-color:var(--link)!important;
       }`
    : "";

  if (label === null && !safeId) return null;

  return (
    <>
      {/* 跟 page.tsx 那处一个道理：<style> 的文本子节点会被 React 转义，
          " 变成 &quot;，而 <style> 是 raw text 元素、浏览器不还原，选择器就废了 */}
      <style dangerouslySetInnerHTML={{ __html: paintCss }} />
      {label !== null && (
    // 样式跟真的那条一份不差（AssigningBar），不然接上的那一刻会跳一下
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: 8,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--link)",
        color: "var(--on-solid)",
        borderRadius: 6,
        padding: "6px 10px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        fontSize: 12,
        maxWidth: "90vw",
      }}
    >
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        正在分配：{label}
      </span>
      <span style={{ flexShrink: 0 }}>
        <input
          ref={inputRef}
          // 可配的资源有几张要等服务端算，这会儿还不知道，所以先不写数字。
          // 打字照收，真条上来了原样搬过去
          placeholder="输入物主名字"
          style={{
            width: 190,
            fontSize: 12,
            padding: "3px 6px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.12)",
            color: "var(--on-solid)",
          }}
        />
      </span>
      {needsNote && (
        <span style={{ flexShrink: 0 }}>
          {/* 跟真条那个 NoteInput 一份不差的尺寸，接上的那一刻才不会跳 */}
          <input
            placeholder="备注"
            style={{
              width: 150,
              fontSize: 12,
              padding: "3px 6px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.45)",
              background: "rgba(255,255,255,0.12)",
              color: "var(--on-solid)",
            }}
          />
        </span>
      )}
      {/* 删除和完成先摆着但不接事件：这半秒里真按下去，请求打给谁都不对。
          摆着是为了几何一致——少两个按钮的话，真条接上时整条会横着跳一下 */}
      <span
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          border: "1px solid rgba(255,255,255,0.5)",
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.4,
          opacity: 0.55,
        }}
      >
        删除这单
      </span>
      <span style={{ flexShrink: 0, fontSize: 12, opacity: 0.55 }}>完成</span>
    </div>
      )}
    </>
  );
}
