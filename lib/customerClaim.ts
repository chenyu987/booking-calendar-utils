import { supabase } from "@/lib/supabase";

// 第一次登录时把 auth 用户跟 customers 表里的人对上。
//
// 为什么不能简单 insert：这个人很可能**库里已经有了** —— 管理员手工录过，
// 或者他自己用老的 /customer/request 表单提交过需求（那时候是拿手机号当身份的）。
// 直接新建会让同一个人在库里裂成两行，他登录后看不到自己的历史订单。
//
// 顺序：先看有没有认领过 → 再按邮箱认领老行 → 都没有才新建。
export async function claimCustomer(authUserId: string, email: string | null) {
  const { data: mine } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (mine) return mine.id as string;

  if (email) {
    // ilike 而不是 eq：邮箱大小写不敏感，库里可能存的是 Admin1@ 而他登录填的是 admin1@。
    // 只认还没被别人认领的行（auth_user_id is null），否则会把别人的订单划给他。
    const { data: candidates } = await supabase
      .from("customers")
      .select("id")
      .ilike("email", email)
      .is("auth_user_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const candidate = candidates?.[0];
    if (candidate) {
      const { error } = await supabase
        .from("customers")
        .update({ auth_user_id: authUserId })
        .eq("id", candidate.id)
        // 再判一次 is null：两个标签页同时登录时，避免后一个把前一个刚认领的行改掉
        .is("auth_user_id", null);
      if (!error) return candidate.id as string;
    }
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ email, auth_user_id: authUserId, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}
