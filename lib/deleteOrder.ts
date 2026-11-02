import { supabase } from "@/lib/supabase";

// 删单（排期总览、Order 列表两个入口共用这一份）。
//
// 「删除」跟「取消」是两回事：取消是业务上发生过、改状态留着；删除是**当它从没存在过** ——
// 名字输错了、管理员身份选错了。所以跟着这一单凭空多出来的客人也一起清掉：
// 删完这一单，这个人要是身上什么都不剩了，就把人删了（people 一删，customers 和
// 「谁的客人」person_contacts 顺着外键 cascade 掉）。
//
// 只要他身上还挂着别的东西就留着人，只删单：
//   - 还有别的单子
//   - 是物主（物主那边可能挂着资源）
//   - 有人的介绍人是他，或者他收过返点
//   - 他自己登录过（auth_user_id 不空，是真人在用的账号）
//
// 老客人用错身份建单再删掉的那种，建单时补上的那条 person_contacts **不撤**：
// 库里分不出它是这一单补的，还是本来就有（导入的、Customer 管理里手动勾的），
// 硬撤会把真关系删掉。这种去 Customer 管理里手动取消勾选。

/** 删掉这一单；顺带删掉的那个人的 id（没删人就是 null） */
export async function deleteOrder(orderId: string): Promise<{ removedPersonId: string | null }> {
  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  // order_assignments/payments/order_notes/matches/referral_payouts 对 orders 都是
  // on delete cascade，删这一条订单会自动把它们清掉
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw new Error(error.message);

  const personId: string | undefined = order?.customer_id;
  if (!personId) return { removedPersonId: null };

  // 查不到 ≠ 没有。任何一条查询出错都当成「还挂着东西」—— 当成「没有」的话，
  // 删人会顺着外键把他的资源、单子一起 cascade 掉。单已经删了，人留着最多是多一个空客人
  const [orders, provider, referees, payouts, person] = await Promise.all([
    supabase.from("orders").select("id").eq("customer_id", personId).limit(1),
    supabase.from("providers").select("id").eq("id", personId).limit(1),
    supabase.from("customers").select("id").eq("referred_by", personId).limit(1),
    supabase.from("referral_payouts").select("order_id").eq("referrer_id", personId).limit(1),
    supabase.from("people").select("auth_user_id").eq("id", personId).maybeSingle(),
  ]);
  const lookups = [orders, provider, referees, payouts, person];
  if (lookups.some((r) => r.error)) {
    console.error("删单后查客人出错，人留着", lookups.map((r) => r.error?.message).filter(Boolean));
    return { removedPersonId: null };
  }
  const stillUsed =
    (orders.data?.length ?? 0) > 0 ||
    (provider.data?.length ?? 0) > 0 ||
    (referees.data?.length ?? 0) > 0 ||
    (payouts.data?.length ?? 0) > 0 ||
    !person.data ||
    person.data.auth_user_id != null;
  if (stillUsed) return { removedPersonId: null };

  const { error: personError } = await supabase.from("people").delete().eq("id", personId);
  if (personError) {
    console.error("删单后删客人失败，人留着", personError.message);
    return { removedPersonId: null };
  }
  return { removedPersonId: personId };
}
