import { supabase } from "@/lib/supabase";

// 第一次登录时把 auth 用户跟库里已有的那行人对上。客户和物主两边逻辑完全一样，
// 只是表不同，所以只写一份 —— 抄第二份的话，哪天改了认领规则一定会漏掉一边。
//
// 为什么不能简单 insert：这个人很可能**库里已经有了** —— 管理员手工录过，
// 或者他自己用老表单提交过（那时候是拿手机号当身份的）。直接新建会让同一个人
// 裂成两行，他登录后看不到自己的历史记录。
//
// 顺序：先看有没有认领过 → 再按邮箱认领老行 → 都没有才新建。
//
// 注意：客户和物主是两个独立入口，没有角色切换。同一个人两边都用的话，
// customers 和 providers 里各有一行，这是有意为之，不是 bug。
async function claim(table: "customers" | "providers", authUserId: string, email: string | null) {
  const { data: mine } = await supabase
    .from(table)
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (mine) return mine.id as string;

  if (email) {
    // ilike 而不是 eq：邮箱大小写不敏感，库里可能存的是 Admin1@ 而他登录填的是 admin1@。
    // 只认还没被别人认领的行（auth_user_id is null），否则会把别人的记录划给他。
    const { data: candidates } = await supabase
      .from(table)
      .select("id")
      .ilike("email", email)
      .is("auth_user_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const candidate = candidates?.[0];
    if (candidate) {
      const { error } = await supabase
        .from(table)
        .update({ auth_user_id: authUserId })
        .eq("id", candidate.id)
        // 再判一次 is null：两个标签页同时登录时，避免后一个把前一个刚认领的行改掉
        .is("auth_user_id", null);
      if (!error) return candidate.id as string;
    }
  }

  const { data: created, error } = await supabase
    .from(table)
    .insert({ email, auth_user_id: authUserId, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export function claimCustomer(authUserId: string, email: string | null) {
  return claim("customers", authUserId, email);
}

export function claimProvider(authUserId: string, email: string | null) {
  return claim("providers", authUserId, email);
}

// 登录时用哪个身份。客户是默认 —— 大多数人是来租借的
export type Role = "customer" | "provider";

export function parseRole(value: string | null | undefined): Role {
  return value === "provider" ? "provider" : "customer";
}

export function claimFor(role: Role, authUserId: string, email: string | null) {
  return role === "provider"
    ? claimProvider(authUserId, email)
    : claimCustomer(authUserId, email);
}

// 登录成功后落到哪
export function homeFor(role: Role) {
  return role === "provider" ? "/provider" : "/customer";
}
