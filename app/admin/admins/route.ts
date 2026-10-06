import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { parseAdminName } from "@/lib/admins";
import { loadAdmins } from "@/lib/personContacts";

// 管理员的增和改名（设置弹框里那一块）。
//
// **不提供删除。** 名下还有客人的话库里 restrict 拦着；没客人的删了也省不了什么，
// 反倒多一个「点错了把整列归属删掉」的口子。员工走了就留着，或者改个名。
//
// 返回最新的管理员列表，弹框拿它直接刷新，不用再 GET 一次。
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  const parsed = parseAdminName(body.name);
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });

  // 重名先在这儿拦一道，给一句人话；库里的 unique 是真闸门（两个人同时加同一个名字）。
  // 不分大小写、改名时跟自己同名不算撞
  const existing = await loadAdmins();
  const id = typeof body.id === "string" ? body.id : null;
  const clash = existing.find(
    (a) => a.name.toLowerCase() === parsed.name.toLowerCase() && a.id !== id
  );
  if (clash) return NextResponse.json({ error: `已经有一个叫「${clash.name}」的管理员了` }, { status: 400 });

  if (id) {
    if (!existing.some((a) => a.id === id)) {
      return NextResponse.json({ error: "这个管理员不存在了，刷新页面再试" }, { status: 400 });
    }
    const { error } = await supabase.from("admins").update({ name: parsed.name }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await supabase.from("admins").insert({ name: parsed.name });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
  return NextResponse.json({ admins: await loadAdmins() });
}
