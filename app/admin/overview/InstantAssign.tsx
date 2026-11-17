"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import AssignEditor, { type EditorData } from "./AssignEditor";
import AssigningBar from "./AssigningBar";
import { ErrorToast } from "./AssignActions";
import { collectChangedEdits } from "./editorFields";
import {
  getPanelData,
  getPatches,
  registerExitHandler,
  setInstantSelection,
  setPatches,
  setPreviousUse,
  usePatch,
  type ExitMode,
} from "./assignSelection";
import {
  applyPatchToEditor,
  patchFromChanges,
  settledPatches,
  type FieldPatch,
} from "./blockPatch";
import { nameCandidates } from "@/lib/assignPanel";
import { previousOrdersFor } from "@/lib/previousUse";
import { frameColor } from "@/lib/orderFrame";
import type { Admin } from "@/lib/admins";
import { dropPersonOptions, type DropOption } from "@/lib/dropPerson";
import { rescaleAmount } from "@/lib/pricing";

// 排期总览的分配态（编辑一单），**全在浏览器里**：进、出、存都不等整页渲染。
//
// 原来进出分配态是一次服务端导航（?assign=<id>），25-26 季 1800 单，整页渲染回来要一两秒，
// 进一次等一次、出一次（存完再刷新）又等一次。现在：
//   - **进**：点色块，当场在同一个格子里画上编辑框（AssignEditor）、左边资源清单换成这一单
//     （ResourcePanel 看 assignSelection）、顶上画浮动条（AssigningBar）。链接的导航拦掉，
//     地址栏用 replaceState 跟着变，刷新 / 分享照旧
//   - **出**（点完成 / 点空白 / 点别的单 / 在框里回车）：收集改过的字段，**当场**退出 ——
//     色块先画成新值（blockPatch.ts，OrderBlock 订阅），写库在后台（save-field），
//     存完后台刷新一次跟库对齐。**存不上**：撤回新值，重新打开这一单，框里是刚才打的，
//     并说出原因 —— 不能让人以为存好了
//   - **Esc**：取消，不存
// 服务端永远只画普通态。分配、撤销分配、拖边改日期这些操作照旧自己调接口再 router.refresh()，
// 刷新回来编辑框跟着拿到新数据（editors 是服务端每次都给的）。
//
// 命令式的东西都有撤销点（CLAUDE.md「命令式改了 DOM 就得自己负责撤」）：
//   - 藏普通态那段：注入一条 CSS 规则，跟节点生死无关；active 一清就没了
//   - 编辑框 portal 进日历 grid，React 管生死
//   - 存失败时把刚才打的字填回去：只填重新打开的那个编辑框，下一次挂载就是新的

export type InstantEditors = Record<string, EditorData & { band: number }>;

export default function InstantAssign({
  editors,
  bandDays,
  exitHref,
  deleteAction,
  admins,
  primaryAdminId,
}: {
  editors: InstantEditors;
  bandDays: string[][];
  exitHref: string;
  deleteAction: (formData: FormData) => Promise<void>;
  /** 浮动条「谁的单」下拉的名单；改了以后边框换色也要它（frameColor） */
  admins: Admin[];
  primaryAdminId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<string | null>(null);
  // 存不上、重新打开时要填回去的字（save-field 的字段名）
  const [draft, setDraft] = useState<{ id: string; changes: Record<string, string> } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const editorsRef = useRef(editors);
  editorsRef.current = editors;
  // 选中那一单最后一次拿到的数据：万一它从 editors 里没了（被筛掉了），编辑框不至于凭空消失
  const lastData = useRef<(EditorData & { band: number }) | null>(null);
  // 同一单连着存两次要排队，不然后发的可能先到，库里留下的是前一次的
  const saving = useRef(new Map<string, Promise<unknown>>());

  const setUrl = useCallback((id: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("assign", id);
    else p.delete("assign");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/admin/overview?${qs}` : "/admin/overview");
  }, []);

  const select = useCallback(
    (id: string) => {
      // flushSync：多半是从 document 上的监听里调的，不是 React 事件，不 flush 要等下一帧
      // 选中写进 assignSelection 也要在 flushSync 里：资源清单、色块的光圈订阅的是它，
      // 放在外面的话它们要等下一轮才重画，跟编辑框错开一帧（e2e 抓到过）
      flushSync(() => {
        setActive(id);
        setDraft(null);
        setInstantSelection(id);
      });
      setUrl(id);
    },
    [setUrl]
  );

  const save = useCallback(
    (id: string, changes: Record<string, string>) => {
      const patch = patchFromChanges(changes);
      const before = getPatches().get(id);
      // 改了是谁的：边框颜色当场跟着换（Beta 地点的单照旧是 Beta 色，frameColor 管）
      if (patch.adminId !== undefined) {
        const location = before?.patch.location ?? editorsRef.current[id]?.location ?? null;
        patch.adminColor = frameColor(location, patch.adminId, admins, primaryAdminId);
      }
      const merged: FieldPatch = { ...before?.patch, ...patch };
      setPatches(new Map(getPatches()).set(id, { patch: merged, savedAt: null }));

      const prev = saving.current.get(id) ?? Promise.resolve();
      const run = prev
        .catch(() => {})
        .then(async () => {
          const res = await fetch("/admin/overview/save-field", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...changes, order_id: id }),
            // 存的时候人可能已经点去别的页了，请求照样送到
            keepalive: true,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || typeof body.at !== "number") throw new Error(body.error ?? `HTTP ${res.status}`);
          return body.at as number;
        });
      saving.current.set(id, run);
      run
        .then((at) => {
          const cur = getPatches().get(id);
          if (cur) setPatches(new Map(getPatches()).set(id, { ...cur, savedAt: at }));
          // 后台刷新一次跟库对齐（别人改的也一起拿回来）。transition：不打断正在做的事
          startTransition(() => router.refresh());
        })
        .catch((err: any) => {
          // 撤回：色块回到存之前的样子
          const next = new Map(getPatches());
          if (before) next.set(id, before);
          else next.delete(id);
          setPatches(next);
          // 手上没在编辑别的单，就重新打开这一单、把刚才打的字填回去；正在编辑别的单就只提示
          if (!activeRef.current && editorsRef.current[id]) {
            select(id);
            setDraft({ id, changes });
          }
          setToast(`没存上：${err?.message ?? err}`);
        })
        .finally(() => {
          if (saving.current.get(id) === run) saving.current.delete(id);
        });
    },
    [router, select, admins, primaryAdminId]
  );

  // 「⋯ → 少几个人」：人数减掉、金额按比例减、退回那几个资源（服务端 drop-person，判断在 lib/dropPerson.ts）。
  // 不退出编辑：色块和编辑框当场画成新样子（补丁），写库在后台，存不上撤回并提示 —— 跟 save 一个路子
  const dropPerson = useCallback(
    (id: string, cur: EditorData, opts: DropOption[]) => {
      if (opts.length === 0) return;
      // 编辑框里还有没存的改动先存上（排在同一条队里，先到先写）：补丁一改人数编辑框就重挂，
      // 不先存的话刚打的字就没了
      const typed = collectChangedEdits(document.querySelector(`[data-assign-editor="${CSS.escape(id)}"]`));
      if (Object.keys(typed).length > 0) save(id, typed);

      const before = getPatches().get(id);
      const male = cur.maleCount - opts.filter((o) => o.gender === "male").length;
      const female = cur.femaleCount - opts.filter((o) => o.gender === "female").length;
      const dropped = opts
        .filter((o) => o.resourceId)
        .map((o) => ({ id: o.resourceId!, gender: o.gender as string | null }));
      const mk = (amount: number | null, savedAt: number | null) => ({
        patch: {
          ...before?.patch,
          maleCount: male,
          femaleCount: female,
          amount: amount == null ? "" : String(amount),
          droppedCards: [...(before?.patch.droppedCards ?? []), ...dropped],
        },
        savedAt,
      });
      // 天数不变，按人数比例先画一个（服务端回来的那个为准）
      const oldAmount = cur.amount == null || cur.amount === "" ? null : Number(cur.amount);
      setPatches(
        new Map(getPatches()).set(
          id,
          mk(rescaleAmount(oldAmount, { days: 1, party: cur.maleCount + cur.femaleCount }, { days: 1, party: male + female }), null)
        )
      );

      const prev = saving.current.get(id) ?? Promise.resolve();
      const run = prev
        .catch(() => {})
        .then(async () => {
          const res = await fetch("/admin/overview/drop-person", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: id,
              drops: opts.map((o) => ({ gender: o.gender, resource_id: o.resourceId })),
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || typeof body.at !== "number") throw new Error(body.error ?? `HTTP ${res.status}`);
          return body as { at: number; amount: number | null };
        });
      saving.current.set(id, run);
      run
        .then((body) => {
          setPatches(new Map(getPatches()).set(id, mk(body.amount, body.at)));
          startTransition(() => router.refresh());
        })
        .catch((err: any) => {
          const next = new Map(getPatches());
          if (before) next.set(id, before);
          else next.delete(id);
          setPatches(next);
          setToast(`没改成：${err?.message ?? err}`);
        })
        .finally(() => {
          if (saving.current.get(id) === run) saving.current.delete(id);
        });
    },
    [router, save]
  );

  const exit = useCallback(
    (mode: ExitMode) => {
      const id = activeRef.current;
      if (!id) return;
      const changes =
        mode === "save"
          ? collectChangedEdits(document.querySelector(`[data-assign-editor="${CSS.escape(id)}"]`))
          : {};
      // 编辑框撤掉和色块画成新值（save 里第一件事就是把补丁记上）要在同一次 flushSync 里：
      // 分开的话编辑框没了、色块还是旧值，中间差一轮（实测量到过）
      flushSync(() => {
        setActive(null);
        setDraft(null);
        setInstantSelection(null);
        if (Object.keys(changes).length > 0) save(id, changes);
      });
      setUrl(null);
    },
    [save, setUrl]
  );

  // 多选、删单要求退出时找这儿
  // （它们多半是在自己的 useEffect 里调的，exit 里有 flushSync，在 effect 里直接 flush 会被
  // React 报错 —— 挪到微任务里，effect 跑完马上就执行）
  useEffect(() => {
    registerExitHandler((mode) => queueMicrotask(() => exit(mode)));
    return () => registerExitHandler(null);
  }, [exit]);

  // 挂上之前一直听服务端的 ?assign=（资源清单 SSR 用）；挂上以后选中归这里管。
  // data-overview-ready：页面能点了（这之前点色块是浏览器原生的整页跳转）—— e2e 等它再点，
  // CI 机器慢，不等的话点在 hydration 之前，测的就不是这套逻辑
  useEffect(() => {
    if (!activeRef.current) setInstantSelection(null);
    document.body.dataset.overviewReady = "1";
    return () => {
      setInstantSelection(null);
      delete document.body.dataset.overviewReady;
    };
  }, []);

  // 地址栏上的 ?assign= 是别人改的（打开页面就带着、建完新单跳过来）：选中它
  const urlAssign = searchParams.get("assign");
  useEffect(() => {
    if (!urlAssign) {
      // 筛选、排序这些导航会把 assign 冲掉（服务端画的表单不知道现在选中了谁）：
      // 还在编辑就把它补回地址栏，不当成退出
      if (activeRef.current) setUrl(activeRef.current);
      return;
    }
    if (urlAssign === activeRef.current || !editors[urlAssign]) return;
    // 微任务：同上，effect 里不能直接 flushSync
    queueMicrotask(() => {
      if (urlAssign === activeRef.current) return;
      exit("save");
      select(urlAssign);
    });
  }, [urlAssign, editors, exit, select, setUrl]);

  // 进 / 出 / 退出时的各种点击
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (document.body.dataset.resizingOrder) return;
      const t = e.target as HTMLElement;
      const orderLink = t.closest?.("a[data-order-id]") as HTMLElement | null;
      if (orderLink) {
        // 修饰键 / 中键：新标签页打开、多选（BulkSelect），这里不管
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        // **捕获阶段拦掉导航**：next/link 看到 defaultPrevented 就不跳。必须在捕获阶段 ——
        // 冒泡阶段轮到这里时 React 已经替链接 router.push 了（CLAUDE.md 返点页那条记着）
        e.preventDefault();
        const id = orderLink.dataset.orderId!;
        if (id === activeRef.current || !editorsRef.current[id]) return;
        exit("save");
        select(id);
        return;
      }
      if (!activeRef.current) return;
      if (t.closest("[data-assign-editor]")) return;
      const link = t.closest("a") as HTMLAnchorElement | null;
      const bar = t.closest("[data-assign-bar]");
      if (bar) {
        // 浮动条上的链接就是「完成」
        if (link) {
          e.preventDefault();
          exit("save");
        }
        return;
      }
      // 资源清单里的东西（配这单、排序、显示全部）各有各的去处，还在编辑
      if (t.closest("#resource-panel")) return;
      // 别的链接（侧边栏去别的页）：存了照常跳，请求是 keepalive 的
      if (link) return exit("save");
      if (t.closest("button, select, input, textarea, form, label, [aria-hidden], [data-bulk-bar]")) return;
      // 点在空白处：退出并存
      exit("save");
    }
    function onSubmit(e: SubmitEvent) {
      // 编辑框里回车：存了退出。拦在捕获阶段，不让 OptimisticEditForm 自己去存再整页跳转
      const form = e.target as HTMLElement;
      if (!activeRef.current || !form.closest?.("[data-assign-editor]")) return;
      e.preventDefault();
      e.stopPropagation();
      exit("save");
    }
    function onKey(e: KeyboardEvent) {
      // Esc 是真取消：不存，退回编辑前的样子
      if (e.key === "Escape" && activeRef.current) exit("discard");
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [exit, select]);

  // 服务端数据追上来了（存完之后才开始查库的那次渲染到了）：撤掉先画上去的新值
  useEffect(() => {
    const check = () => {
      const pending = getPatches();
      if (pending.size === 0) return;
      const raw = document.querySelector<HTMLElement>("[data-rendered-at]")?.dataset.renderedAt;
      const done = settledPatches(pending, raw ? Number(raw) : null);
      if (done.length === 0) return;
      const next = new Map(pending);
      done.forEach((id) => next.delete(id));
      setPatches(next);
    };
    check();
    const mo = new MutationObserver(check);
    // childList 也看：main 万一整个换了新节点，属性变化收不到
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-rendered-at"] });
    return () => mo.disconnect();
  }, []);

  // 「上一次」那几单：选中这一单配的资源，上一次分别用在哪一单（lib/previousUse.ts）
  useEffect(() => {
    const data = getPanelData();
    const order = active && data?.orders[active];
    setPreviousUse(
      order
        ? previousOrdersFor(order.id, order.demandDays, order.assignedResourceIds, new Map(Object.entries(data!.usesByResource)))
        : new Set()
    );
  }, [active, editors]);

  // 浮动条「打名字分配」的候选：跟资源清单同一份数据、同一个算法（lib/assignPanel.ts）。
  // editors 变了 = 服务端数据刷新了，候选跟着重算
  const candidates = useMemo(() => {
    const data = getPanelData();
    const order = active && data?.orders[active];
    return order ? nameCandidates(order, data!.allResources, data!.bookedDays, data!.history) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editors]);

  // 存不上重新打开时，把刚才打的字填回去（data-original 还是库里的值，退出时照样算「改过」）
  useLayoutEffect(() => {
    if (!draft || draft.id !== active) return;
    const ed = document.querySelector(`[data-assign-editor="${CSS.escape(draft.id)}"]`);
    if (!ed) return;
    for (const [name, value] of Object.entries(draft.changes)) {
      const input = ed.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${CSS.escape(name)}"]:not([type="hidden"])`);
      if (!input) continue;
      const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [draft, active]);

  // 选中那一单的数据：服务端最新的那份，盖上还在后台存的改动
  const live = active ? editors[active] : null;
  if (live) lastData.current = live;
  const base = active ? live ?? (lastData.current?.orderId === active ? lastData.current : null) : null;
  // 订阅着：浮动条上改「谁的单」不退出编辑，没有别的 state 变化带着这里重画
  const pending = usePatch(active ?? "");
  const d = base && pending ? applyPatchToEditor(base, pending.patch) : base;

  const toastEl = toast ? <ErrorToast message={toast} onClose={() => setToast(null)} /> : null;
  if (!d) return toastEl;
  const grid = document.querySelector(`[data-band-grid="${d.band}"]`);
  if (!grid) return toastEl;
  // id 是 UUID，过一道白名单再拼进选择器
  const safeId = /^[A-Za-z0-9-]+$/.test(d.orderId) ? d.orderId : null;
  // 库里的值变了（刷新回来的，比如拖边改了天数、金额跟着变）就重新挂载编辑框：
  // 输入框是 defaultValue，不重挂的话还显示旧值
  const editorKey = [d.orderId, d.customerName, d.location, d.status, d.note, d.amount, d.maleCount, d.femaleCount].join("|");

  return (
    <>
      {toastEl}
      {/* 原来那段普通态藏起来（只藏放编辑控件的那一段；别的段 OrderBlock 自己画成空框、亮选中光圈）。
          注入 CSS 规则而不是改节点：跟节点生死无关，active 一清就撤。必须走 dangerouslySetInnerHTML，见 CLAUDE.md */}
      {safeId && (
        <style
          dangerouslySetInnerHTML={{
            __html: `a[data-order-id="${safeId}"][data-edit-seg]{visibility:hidden}`,
          }}
        />
      )}
      {createPortal(
        <AssignEditor key={editorKey} d={d} timeline={bandDays[d.band] ?? []} exitHref={exitHref} />,
        grid
      )}
      <AssigningBar
        key={d.orderId}
        orderId={d.orderId}
        label={[d.customerName, d.location].filter(Boolean).join(" · ")}
        note={d.note}
        candidates={candidates}
        deleteAction={deleteAction}
        exitHref={exitHref}
        onDelete={() => exit("discard")}
        admins={admins}
        adminId={d.adminId}
        // 跟退出时存字段走同一条路（save）：色块边框当场换色、后台写库、存不上撤回并提示。
        // 不等退出才存 —— 这个下拉在浮动条上，不在编辑框里，退出时收字段收不到它
        onAdminChange={(adminId) => save(d.orderId, { admin_id: adminId })}
        dropOptions={dropPersonOptions(d.maleCount, d.femaleCount, d.cards)}
        onDropPerson={(opts) => dropPerson(d.orderId, d, opts)}
        party={d.maleCount + d.femaleCount}
        amount={d.amount}
      />
    </>
  );
}
