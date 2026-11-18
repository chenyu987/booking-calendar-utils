"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { OverviewRaw } from "@/lib/overviewModel";
import {
  collectChanges,
  emptyRequest,
  isEmptyRequest,
  mergeRaw,
  touchedOrders,
  type ChangeMsg,
  type RowsRequest,
  type RowsResponse,
} from "@/lib/overviewLive";
import { browserSupabase } from "@/lib/supabaseBrowser";
import { getSelection, useAssignSelection } from "./assignSelection";
import { markMerged, registerLiveFetcher } from "./liveData";

// 排期总览的实时更新（浏览器这头）。整体思路见 lib/overviewLive.ts：
// 收到「哪张表哪一行变了」→ 攒 300ms → 只拉那几行 → 合进手里的原始数据 → 模型层再算一遍。
//
// 几个要点：
//   - **正在编辑的那一单先不合**：合进去编辑框会重挂、刚打的字没了。记下来，退出编辑后再拉一次
//   - 服务端整页重新渲染（自己存完 router.refresh、切筛选）带来新的整季数据时，以它为准；
//     但它开始查库之后才合进来的那几批（log 里 at 更晚的）要在它上面再合一次，不然会退回旧样子
//   - 断线重连之后整页重拉一次：断着的那段时间的通知收不到
//   - 标签页在后台时先攒着，切回来再拉（不看的时候不花流量）
//   - 浏览器测试（E2E 构建）没有真的 Realtime：改听 window 上的 overview-live-test 事件，测试自己发

const DEBOUNCE_MS = 300;
/** 合过的那几批留多久（够盖住一次整页重新渲染的来回就行） */
const LOG_TTL_MS = 5 * 60_000;
export const LIVE_TEST_EVENT = "overview-live-test";

export function useLiveRaw(serverRaw: OverviewRaw, seasonKey: string, renderedAt: number): OverviewRaw {
  const router = useRouter();
  /** 合过的那几批（receivedAt 是浏览器自己的钟，只用来清掉太老的） */
  const log = useRef<{ delta: RowsResponse; receivedAt: number }[]>([]);
  /** 因为正在编辑而先放着没合的单 */
  const deferred = useRef<Set<string>>(new Set());
  const [state, setState] = useState({ base: serverRaw, raw: serverRaw });

  // 服务端送来新的整季数据：以它为准，再把它查库之后才合进来的那几批补上
  let current = state;
  if (state.base !== serverRaw) {
    const editing = skipSet();
    let r = serverRaw;
    for (const { delta } of log.current) if (delta.at > renderedAt) r = mergeRaw(r, delta, editing);
    current = { base: serverRaw, raw: r };
    setState(current);
  }

  /** 拉这几行、合进来。合进去了返回 true（自己存完的那几条路靠它决定要不要退回整页刷新） */
  const fetchRows = useRef<(req: RowsRequest, own?: boolean) => Promise<boolean>>(async () => false);
  fetchRows.current = async (req: RowsRequest, own = false) => {
    if (req.full) {
      router.refresh();
      return true;
    }
    if (isEmptyRequest(req)) return true;
    const res = await fetch("/admin/overview/rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season: seasonKey, ...req }),
    });
    if (!res.ok) return false; // 拉不到：通知来的那种算了（下一次整页渲染会带上），自己存的那种调用方会退回整页刷新
    const delta = (await res.json()) as RowsResponse;
    const now = Date.now();
    log.current = [...log.current.filter((d) => now - d.receivedAt < LOG_TTL_MS), { delta, receivedAt: now }];
    // 别人改的：正在编辑的那一单先不合；自己刚存的：照合
    const editing = own ? new Set<string>() : skipSet();
    const touched = touchedOrders(delta);
    for (const id of touched) if (editing.has(id)) deferred.current.add(id);
    // 先把新数据画上去，再告诉「先画上去的新值」可以撤了 —— 反过来的话中间会闪一下旧值
    flushSync(() => setState((s) => ({ ...s, raw: mergeRaw(s.raw, delta, editing) })));
    markMerged(
      touched.filter((id) => !editing.has(id)),
      delta.at
    );
    return true;
  };

  // 自己存完的那几条路（liveData.ts 的 refetchRows）也走这儿
  useEffect(() => {
    registerLiveFetcher((req, own) => fetchRows.current({ ...emptyRequest(), ...req }, own));
    return () => registerLiveFetcher(null);
  }, []);

  // 退出编辑（或换了一单）：刚才先放着的那几单现在拉
  const selected = useAssignSelection(null);
  useEffect(() => {
    const ids = [...deferred.current].filter((id) => id !== selected);
    if (ids.length === 0) return;
    ids.forEach((id) => deferred.current.delete(id));
    fetchRows.current({ orders: ids, customers: [], resources: [], notes: ids, dayNotes: false, full: false });
  }, [selected]);

  useEffect(() => {
    let pending: ChangeMsg[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (document.hidden || pending.length === 0) return;
      const req = collectChanges(pending);
      pending = [];
      fetchRows.current(req);
    };
    const onMsg = (m: ChangeMsg) => {
      pending.push(m);
      if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (!document.hidden && pending.length) flush();
    };
    document.addEventListener("visibilitychange", onVisible);

    let cleanup: () => void;
    if (process.env.E2E_FAKE_LOGIN === "1") {
      const onTest = (e: Event) => onMsg((e as CustomEvent<ChangeMsg>).detail);
      window.addEventListener(LIVE_TEST_EVENT, onTest);
      cleanup = () => window.removeEventListener(LIVE_TEST_EVENT, onTest);
    } else {
      const sb = browserSupabase();
      let dropped = false;
      let closed = false;
      const channel = sb.channel("admin-changes", { config: { private: true } });
      channel.on("broadcast", { event: "change" }, ({ payload }) => onMsg(payload as ChangeMsg));
      // 私有频道要带登录身份（管理员才收得到，见迁移 0035 的策略）
      sb.auth.getSession().then(({ data }) => {
        if (closed) return;
        if (data.session) sb.realtime.setAuth(data.session.access_token);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // 断过线：断着的那段时间的通知收不到，整页重拉一次
            if (dropped) router.refresh();
            dropped = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            dropped = true;
          }
        });
      });
      cleanup = () => {
        closed = true;
        sb.removeChannel(channel);
      };
    }
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      cleanup();
    };
  }, [seasonKey, router]);

  return current.raw;
}

function skipSet(): Set<string> {
  const id = getSelection();
  return new Set(id ? [id] : []);
}
