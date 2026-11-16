// 后台 ⌘K 全局搜索的纯逻辑：拼查询条件、把查回来的行变成一条条结果。
// 查库在 app/admin/search/route.ts，这里不碰数据库，客户端组件也能 import（SearchHit 类型）。

import { displayName, selfName } from "./person";
import { seasonOf } from "./season";
import { STATUS_LABELS } from "./orderStatus";
import { formatDayRanges } from "./dates";

export type SearchGroup = "客户" | "物主" | "订单" | "资源" | "需求" | "页面";

export type SearchHit = { group: SearchGroup; title: string; sub: string; href: string };

/** 搜索词最长留多少：再长也不会是谁的名字，只会让 URL 变长 */
export const MAX_QUERY = 64;

export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_QUERY);
}

/**
 * 「包含 q」的 ilike 模式。用户打的 % 和 _ 当字面字符（账号里 _ 很常见，
 * 不转义的话 a_b 会对上 aXb）；* 是 PostgREST 的通配，直接去掉
 */
export function containsPattern(q: string): string {
  const escaped = q.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * 几列里任一列包含 q，给 supabase-js 的 `.or()`。
 * 值用双引号包起来：名字里的逗号、括号、点在 or 语法里都有含义，不包的话整条查询就坏了。
 * 引号里的 " 和 \ 再转义一层
 */
export function orContains(columns: readonly string[], q: string): string {
  const quoted = `"${containsPattern(q).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(",");
}

/** people 上拿来搜的列。地址、备注不搜 —— 搜一个「温哥华」能对上几百人，那是筛选不是找人 */
export const PERSON_SEARCH_COLUMNS = [
  "chat_name",
  "chat_id",
  "first_name",
  "last_name",
  "phone_number",
  "email",
] as const;

type PersonRow = {
  id: string;
  chat_name?: string | null;
  chat_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
};

const joinSub = (...parts: (string | null | undefined)[]) =>
  parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

/**
 * Provider 管理没有「定位到某一行」，借它的筛选：名字那一格比的是昵称和称呼（providerFilter.ts），
 * 两样都没有的人只能按账号筛
 */
export function providerHref(p: PersonRow): string {
  const name = (p.chat_name ?? "").trim() || selfName(p);
  if (name) return `/admin/providers?name=${encodeURIComponent(name)}`;
  return `/admin/providers?chat=${encodeURIComponent((p.chat_id ?? "").trim())}`;
}

/** 一个人可能既是客户又是物主：两条都出，各跳各的管理页 */
export function personHits(
  people: PersonRow[],
  customerIds: ReadonlySet<string>,
  providerIds: ReadonlySet<string>
): SearchHit[] {
  const customers: SearchHit[] = [];
  const providers: SearchHit[] = [];
  for (const p of people) {
    const title = displayName(p);
    const sub = joinSub(p.chat_id, p.phone_number, p.email);
    if (customerIds.has(p.id)) {
      customers.push({ group: "客户", title, sub, href: `/admin/customers?focus=${encodeURIComponent(p.id)}` });
    }
    if (providerIds.has(p.id)) {
      providers.push({ group: "物主", title, sub, href: providerHref(p) });
    }
  }
  return [...customers, ...providers];
}

type OrderRow = {
  id: string;
  demand_days?: string[] | null;
  location?: string | null;
  status?: string | null;
  customers?: PersonRow | null;
};

/**
 * 订单跳排期总览、直接选中那一单。总览一次只读一季，所以带上这单第一天所在的季 ——
 * 不带的话落在「今天这季」，往年的单子根本不在盘子上
 */
export function orderHref(o: { id: string; demand_days?: string[] | null }): string {
  const first = [...(o.demand_days ?? [])].sort()[0];
  const p = new URLSearchParams();
  if (first) p.set("season", seasonOf(first).key);
  p.set("assign", o.id);
  return `/admin/overview?${p.toString()}`;
}

/** 最近的单子排前面（按第一天倒序） */
export function orderHits(orders: OrderRow[]): SearchHit[] {
  const firstDay = (o: OrderRow) => [...(o.demand_days ?? [])].sort()[0] ?? "";
  return [...orders]
    .sort((a, b) => firstDay(b).localeCompare(firstDay(a)))
    .map((o) => ({
      group: "订单" as const,
      title: joinSub(displayName(o.customers), o.location),
      sub: joinSub(
        o.demand_days?.length ? formatDayRanges([...o.demand_days].sort()) : "",
        STATUS_LABELS[o.status ?? ""] ?? o.status
      ),
      href: orderHref(o),
    }));
}

type ResourceRow = {
  id: string;
  holder_name?: string | null;
  item_type?: string | null;
  deleted_at?: string | null;
  providers?: PersonRow | null;
};

export function resourceHits(resources: ResourceRow[]): SearchHit[] {
  return resources.map((s) => ({
    group: "资源",
    title: s.holder_name?.trim() || "（没填持有人）",
    sub: joinSub(
      s.item_type ? s.item_type.toUpperCase() : "",
      s.providers ? `物主 ${displayName(s.providers)}` : "",
      s.deleted_at ? "已删除" : ""
    ),
    // sstatus=all：Resource 页默认只看出租中，搜到的可能是过期 / 下架的资源
    href: `/admin/resources?holder=${encodeURIComponent(s.holder_name ?? "")}&sstatus=all`,
  }));
}

type RequestRow = {
  id: string;
  sender: string;
  group_name?: string | null;
  quote?: string | null;
  sent_at?: string | null;
};

export function requestHits(requests: RequestRow[]): SearchHit[] {
  return requests.map((r) => ({
    group: "需求",
    title: r.sender,
    sub: joinSub(r.group_name, r.sent_at, (r.quote ?? "").replace(/\s+/g, " ").slice(0, 40)),
    // status=all：已经标了「不跟」的也要搜得到
    href: `/admin/chat-requests?status=all&sender=${encodeURIComponent(r.sender)}`,
  }));
}
