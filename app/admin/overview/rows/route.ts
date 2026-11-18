import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ORDER_SELECT, RESOURCE_SELECT } from "@/lib/overviewData";
import { parseSeasonKey, seasonDays, seasonOf } from "@/lib/season";
import { todayIso } from "@/lib/dates";
import type { RowsResponse } from "@/lib/overviewLive";

// 排期总览实时更新：只拉变了的那几行（lib/overviewLive.ts 的 collectChanges 算出来要哪几行）。
// 查哪几列跟整季拉的那次是同一份（lib/overviewData.ts）—— 合进浏览器的数据必须跟整季拉的长得一样。
//
// /admin 下的路由由 middleware 拦着，没登录管理员进不来。广播里只有 id，内容只能从这儿拿。

const MAX_IDS = 500;

function ids(v: unknown): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_IDS || v.some((x) => typeof x !== "string")) return null;
  return [...new Set(v as string[])];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }
  const orderIds = ids(body.orders);
  const customerIds = ids(body.customers);
  const resourceIds = ids(body.resources);
  const noteIds = ids(body.notes);
  if (!orderIds || !customerIds || !resourceIds || !noteIds) {
    return NextResponse.json({ error: "参数不对" }, { status: 400 });
  }
  // 看的是哪一季：单子改了日期挪出这季，就当它没了（row: null）
  const season =
    parseSeasonKey(typeof body.season === "string" ? body.season : undefined) ?? seasonOf(todayIso());
  const days = seasonDays(season);
  const at = Date.now();

  const empty = Promise.resolve({ data: [] as any[], error: null });
  const [byId, byCustomer, sup, notes, dayNotes] = await Promise.all([
    orderIds.length
      ? supabase.from("orders").select(ORDER_SELECT).in("id", orderIds).overlaps("demand_days", days)
      : empty,
    customerIds.length
      ? supabase.from("orders").select(ORDER_SELECT).in("customer_id", customerIds).overlaps("demand_days", days)
      : empty,
    resourceIds.length
      ? supabase.from("resources").select(RESOURCE_SELECT).in("id", resourceIds).is("deleted_at", null)
      : empty,
    noteIds.length
      ? supabase.from("order_notes").select("order_id, internal_note").in("order_id", noteIds)
      : empty,
    body.dayNotes === true ? supabase.from("day_notes").select("day, note") : Promise.resolve(null),
  ]);
  const err = [byId, byCustomer, sup, notes, dayNotes].find((r) => r && r.error)?.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const found = new Map<string, any>();
  for (const o of [...(byId.data ?? []), ...(byCustomer.data ?? [])]) found.set(o.id, o);
  const supFound = new Map((sup.data ?? []).map((s: any) => [s.id, s]));

  const res: RowsResponse = {
    at,
    // 问了却没回来的 = 删了或者挪出了这季
    orders: [
      ...orderIds.map((id) => ({ id, row: found.get(id) ?? null })),
      ...[...found.values()].filter((o) => !orderIds.includes(o.id)).map((o) => ({ id: o.id, row: o })),
    ],
    resources: resourceIds.map((id) => ({ id, row: supFound.get(id) ?? null })),
    notesFor: noteIds,
    orderNotes: notes.data ?? [],
    ...(dayNotes ? { dayNotes: dayNotes.data ?? [] } : {}),
  };
  return NextResponse.json(res);
}
