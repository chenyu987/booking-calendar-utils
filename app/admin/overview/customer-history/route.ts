import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildCustomerHistory } from "@/lib/customerHistory";

// 排期总览：鼠标停在客人名字上时来拿这个人的全部订单（不分季）+ 当时配的资源。
// 只读。/admin 下的路由由 middleware 拦着，没登录管理员进不来。
// 整理成浮层要的样子在 lib/customerHistory.ts（纯函数，有单测）。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customer") ?? "";
  const orderId = req.nextUrl.searchParams.get("order");
  // 坏参数直接拒：拼进 PostgREST 查询之前先确认是个 id
  if (!UUID.test(customerId) || (orderId !== null && !UUID.test(orderId))) {
    return NextResponse.json({ error: "参数不对" }, { status: 400 });
  }

  const orders = await supabase
    .from("orders")
    .select("id, demand_days, location, status, male_count, female_count, order_assignments(resource_id)")
    .eq("customer_id", customerId);
  if (orders.error) return NextResponse.json({ error: orders.error.message }, { status: 500 });

  const resourceIds = [
    ...new Set((orders.data ?? []).flatMap((o: any) => (o.order_assignments ?? []).map((a: any) => a.resource_id))),
  ];
  // 物主删掉的资源这里**也要**：当时就是配的它，历史不能因为后来删了资源就少一张
  const resources = resourceIds.length
    ? await supabase
        .from("resources")
        .select("id, holder_name, holder_gender")
        .in("id", resourceIds)
    : { data: [], error: null };
  if (resources.error) return NextResponse.json({ error: resources.error.message }, { status: 500 });

  return NextResponse.json(buildCustomerHistory((orders.data ?? []) as any, (resources.data ?? []) as any, orderId));
}
