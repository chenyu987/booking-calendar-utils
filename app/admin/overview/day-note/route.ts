import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

// 日期条上「这一天的备注」。跟分配那些一样走 Route Handler 不走 Server Action：
// 写完就返回，整页重渲染交给客户端的 router.refresh() 在后台跑。
//
// 清空 = 删掉整行，不是存一个空字符串。这张表只有 note 一列有内容，留着空行没意义，
// 而且 note 上有 not null，空行也存不进去。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const day = typeof body.day === "string" ? body.day : "";
  // 只认 YYYY-MM-DD —— 这个值是 day date 的主键，格式歪了 Postgres 那边会直接报错
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day 必须是 YYYY-MM-DD" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const { error } = note
    ? await supabase
        .from("day_notes")
        .upsert({ day, note, updated_at: new Date().toISOString() }, { onConflict: "day" })
    : await supabase.from("day_notes").delete().eq("day", day);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/overview");
  return NextResponse.json({ ok: true });
}
