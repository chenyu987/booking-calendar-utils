import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS } from "@/lib/person";
import {
  PERSON_SEARCH_COLUMNS,
  normalizeQuery,
  orContains,
  orderHits,
  personHits,
  requestHits,
  resourceHits,
  type SearchHit,
} from "@/lib/globalSearch";

// 后台 ⌘K 全局搜索：GET /admin/search?q=xxx → { hits }。
// 只读。登录由 middleware 拦（/admin 底下没登录的 Route Handler 直接 401）。

export const dynamic = "force-dynamic";

const PERSON_LIMIT = 12;
const ORDER_LIMIT = 10;
const RESOURCE_LIMIT = 8;
const REQUEST_LIMIT = 8;

export async function GET(req: Request) {
  const q = normalizeQuery(new URL(req.url).searchParams.get("q"));
  if (q.length < 1) return NextResponse.json({ hits: [] });

  const [people, resources, requests, notes] = await Promise.all([
    supabase
      .from("people")
      // 列名写死成字面量：supabase-js 在类型层面解析 select，拼出来的 string 它解析不了
      .select("id, chat_name, chat_id, first_name, last_name, phone_number, email")
      .or(orContains(PERSON_SEARCH_COLUMNS, q))
      .order("created_at", { ascending: false })
      .limit(PERSON_LIMIT),
    supabase
      .from("resources")
      .select(`id, holder_name, item_type, deleted_at, providers(${personSpread(DISPLAY_COLUMNS)})`)
      .or(orContains(["holder_name"], q))
      .order("created_at", { ascending: false })
      .limit(RESOURCE_LIMIT),
    supabase
      .from("chat_requests")
      .select("id, sender, group_name, quote, sent_at")
      .or(orContains(["sender", "quote"], q))
      .order("created_at", { ascending: false })
      .limit(REQUEST_LIMIT),
    // 订单本身没有文字列可搜（客户名字走上面的人），备注里写的东西（「一女21岁」「酒店取资源」）搜这儿
    supabase
      .from("order_notes")
      .select("order_id")
      .or(orContains(["internal_note", "special_request"], q))
      .limit(ORDER_LIMIT),
  ]);

  const failed = [people, resources, requests, notes].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const personRows = (people.data ?? []) as { id: string }[];
  const personIds = personRows.map((p) => p.id);
  const noteOrderIds = (notes.data ?? []).map((n: { order_id: string }) => n.order_id);

  const ORDER_COLUMNS = `id, demand_days, location, status, customers(${personSpread(DISPLAY_COLUMNS)})` as const;
  const [customers, providers, ordersByPerson, ordersByNote] = await Promise.all([
    personIds.length ? supabase.from("customers").select("id").in("id", personIds) : null,
    personIds.length ? supabase.from("providers").select("id").in("id", personIds) : null,
    personIds.length
      ? supabase
          .from("orders")
          .select(ORDER_COLUMNS)
          .in("customer_id", personIds)
          .order("created_at", { ascending: false })
          .limit(ORDER_LIMIT)
      : null,
    noteOrderIds.length ? supabase.from("orders").select(ORDER_COLUMNS).in("id", noteOrderIds) : null,
  ]);
  const failed2 = [customers, providers, ordersByPerson, ordersByNote].find((r) => r?.error);
  if (failed2?.error) {
    return NextResponse.json({ error: failed2.error.message }, { status: 500 });
  }

  const ids = (r: typeof customers) => new Set((r?.data ?? []).map((x: { id: string }) => x.id));
  // 同一单可能两边都搜到（名字对上了、备注也对上了），只出一次
  const orders = new Map<string, any>();
  for (const o of [...(ordersByPerson?.data ?? []), ...(ordersByNote?.data ?? [])]) orders.set(o.id, o);

  const hits: SearchHit[] = [
    ...personHits(personRows as any, ids(customers), ids(providers)),
    ...orderHits([...orders.values()]).slice(0, ORDER_LIMIT),
    ...resourceHits((resources.data ?? []) as any),
    ...requestHits((requests.data ?? []) as any),
  ];
  return NextResponse.json({ hits });
}
