"use client";

import { useEffect, useState } from "react";

// 这一页的三个开关：切视图、点块开登记面板、点别处收起来。
//
// **三个都不要新数据** —— 台账和日历是同一批 groups 画出来的，登记面板要的那行
// 也早就在手上了。按 CLAUDE.md 那条标准（「这一下要不要新数据」），它们就该是
// 客户端状态：原来走 URL 参数每点一下都回服务端整页重渲染，要查客户 + 订单 +
// 返点付款三张表，一次一两秒，于是每个开关都成了「点一下等两秒」。
//
// 实现上**不直接动 DOM 节点，而是注入一条 CSS 规则** —— 跟排期总览的 BulkSelect
// 一个路子。CLAUDE.md 里那条教训：命令式改了节点就得自己负责撤，服务端重渲染时
// 节点是复用的，内联样式会赖着不走。规则跟节点的生死无关，新渲染出来的节点自动
// 带上，天然不用清理。
//
// 地址栏用 history.replaceState 跟着变 —— 不触发导航，但刷新 / 收藏 / 分享照旧。
export default function ReferralUI({
  initialView,
  initialPay,
}: {
  initialView: "calendar" | "ledger";
  initialPay: string;
}) {
  const [view, setView] = useState(initialView);
  const [pay, setPay] = useState(initialPay);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;

      // 新开标签页那几个手势（⌘/Ctrl 点、中键、shift）不拦，照常走链接
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      // **必须连 stopPropagation 一起** —— 这些是 next/link 的 <a>，
      // React 18 把处理器挂在根容器上。光 preventDefault 不行：这个监听跑在
      // 捕获阶段、事件还没到根容器，但冒泡回去时 Link 照样会 router.push，
      // 实测还是回了一趟服务端（~1000ms）。拦住才是真的没走网络。
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // 切视图
      const seg = t.closest<HTMLElement>("[data-view-btn]");
      if (seg) {
        stop();
        setView(seg.dataset.viewBtn === "ledger" ? "ledger" : "calendar");
        return;
      }

      // 点一个块：开它的面板，再点一次收起
      const block = t.closest<HTMLElement>("[data-pay-key]");
      if (block) {
        stop();
        const key = block.dataset.payKey ?? "";
        setPay((cur) => (cur === key ? "" : key));
        return;
      }

      // 点在**那个资源**里面不算「点别处」—— 不然点个输入框面板就没了。
      // 认的不是外面那个格子：格子跨好几列好几行，一大片空白，
      // 认它的话在日历里点空白处收不起来
      if (t.closest("[data-ref-card]")) return;

      // 点别处：收起来
      setPay("");
    }
    // 捕获阶段：要抢在 React 的根容器处理器前面
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Esc 也收起来，跟排期总览退出分配态一个手势
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPay("");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (view === "ledger") qs.set("view", "ledger");
    if (pay) qs.set("pay", pay);
    const s = qs.toString();
    history.replaceState(null, "", s ? `/admin/referrals?${s}` : "/admin/referrals");
  }, [view, pay]);

  // CSS 转义：key 是 uuid::uuid，进选择器前要挡住引号之类的
  const safe = pay.replace(/["\\]/g, "");

  const css = `
[data-ref-view="${view === "ledger" ? "calendar" : "ledger"}"]{display:none!important}
/* 两条都得带 !important：按钮的激活态是服务端渲染的**内联样式**，
   内联压过普通 CSS 规则。先前这条「全部还原成未选中」没带，于是服务端那个
   日历的黑底赖着不走，下面那条又把台账也点亮 —— 两个都是黑的。
   顺序有讲究：先全还原，再点亮当前那个（同优先级，后面的赢）。 */
[data-view-btn]{background:var(--surface)!important;color:var(--text-muted)!important;border-color:var(--border-strong)!important}
[data-view-btn="${view}"]{background:var(--solid-bg)!important;color:var(--on-solid)!important;border-color:var(--solid-bg)!important}
[data-ref-panel]{display:none}
${safe ? `[data-ref-panel="${safe}"]{display:block}` : ""}
${safe ? `[data-pay-key="${safe}"]{outline:2px solid var(--link);outline-offset:1px}` : ""}
`;

  // <style>{css}</style> 不行：React 会把 > 和 " 转义，而 <style> 是 raw text
  // 元素、浏览器不还原，选择器整个失效（CLAUDE.md 里那条）
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
