import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS } from "@/lib/person";
import { bookingPopupRows } from "@/lib/resourceBookings";

// Resource 管理「排期」浮层点开时来拿这一个资源的明细（为什么不跟页面一起渲染，见 lib/resourceBookings.ts）。
// 在 /admin 底下，middleware 先验了管理员登录。
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺 id" }, { status: 400 });

  const { data, error } = await supabase
    .from("order_assignments")
    .select(`orders(id, location, demand_days, status, customers(${personSpread(DISPLAY_COLUMNS)}))`)
    .eq("resource_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []).map((a: any) => a.orders).filter(Boolean);
  return NextResponse.json({ rows: bookingPopupRows(orders) });
}
