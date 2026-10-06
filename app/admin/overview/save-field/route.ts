import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { STATUS_LABELS } from "@/lib/orderStatus";

// 分配模式里那几个字段（客人姓名/地点/男女人数/总价/状态）退出编辑时用
// navigator.sendBeacon 打到这里，不走 Server Action。
//
// 为什么不用 Server Action：sendBeacon 是浏览器专门为"页面要跳走了，
// 但这个请求必须发出去"设计的——不管页面导航到哪，请求都会送达，不会被
// 取消。亲测 Server Action 不是这样：Next 的客户端路由在新导航开始时，
// 会把上一个还没完成的 action fetch 直接 abort 掉，写到一半的编辑会
// 安静地丢掉。sendBeacon 打普通 Route Handler 没有这个问题。
// 代价：sendBeacon 拿不到响应，出错了也不会有提示——这是"退出编辑要
// 立刻发生"和"看得到报错"之间的取舍，这里选前者。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const orderId = body.order_id as string;
  if (!orderId) return NextResponse.json({ error: "缺 order_id" }, { status: 400 });

  try {
    if (typeof body.customer_name === "string" && body.customer_name.trim()) {
      const { data: ord } = await supabase
        .from("orders")
        .select("customer_id")
        .eq("id", orderId)
        .single();
      if (ord) {
        const { error } = await supabase
          // 名字在人身上（people）；customer_id 就是 people.id（0017）
          .from("people")
          .update({ first_name: body.customer_name.trim() })
          .eq("id", ord.customer_id);
        if (error) throw new Error(error.message);
      }
    }

    if (typeof body.location === "string") {
      const { error } = await supabase
        .from("orders")
        .update({ location: body.location.trim() || null })
        .eq("id", orderId);
      if (error) throw new Error(error.message);
    }

    if (body.male_count !== undefined && body.female_count !== undefined) {
      const maleCount = Number(body.male_count);
      const femaleCount = Number(body.female_count);
      if (
        Number.isInteger(maleCount) &&
        maleCount >= 0 &&
        Number.isInteger(femaleCount) &&
        femaleCount >= 0
      ) {
        const { error } = await supabase
          .from("orders")
          .update({ male_count: maleCount, female_count: femaleCount })
          .eq("id", orderId);
        if (error) throw new Error(error.message);
      }
    }

    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (Number.isFinite(amount) && amount >= 0) {
        const { error } = await supabase.from("orders").update({ amount }).eq("id", orderId);
        if (error) throw new Error(error.message);
      }
    }

    // 备注存在 order_notes（跟 orders 一对一，order_id 上有 unique 约束），
    // 所以直接 upsert，不用先查一次有没有。清空就把这一列置成 null，不删整行——
    // 那行上还有 pickup_method / sales_channel 之类的列（暂时没 UI 在用）。
    //
    // 注意：这一列里可能躺着「取消原因」功能写进去的 JSON 信封，界面上显示的是
    // readNoteText 拆出来的纯文本。所以一旦有人在这儿改了备注，信封就会被纯文本
    // 覆盖掉——这正是想要的，顺手把那条孤儿数据规整了。
    if (typeof body.note === "string") {
      const note = body.note.trim();
      const { error } = await supabase
        .from("order_notes")
        .upsert(
          { order_id: orderId, internal_note: note || null },
          { onConflict: "order_id" }
        );
      if (error) throw new Error(error.message);
    }

    if (typeof body.status === "string" && STATUS_LABELS[body.status]) {
      const { error } = await supabase
        .from("orders")
        .update({ status: body.status })
        .eq("id", orderId);
      if (error) throw new Error(error.message);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");

  return NextResponse.json({ ok: true });
}
