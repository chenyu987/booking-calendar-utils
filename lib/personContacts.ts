import { supabase } from "@/lib/supabase";
import { contactsDiff, type Admin } from "@/lib/admins";

// 管理员 + 「这个客人是谁的」（迁移 0018）读写库的那一半。纯逻辑在 lib/admins.ts。

/** 所有管理员，按建的先后排（Admin1、admin2 在最前面） */
export async function loadAdmins(): Promise<Admin[]> {
  const { data, error } = await supabase
    .from("admins")
    .select("id, name")
    .order("created_at", { ascending: true });
  // 查不出来就报错，不当成「一个管理员都没有」—— 那样编辑时一个都勾不了，
  // 存的时候还会把这个人原来挂着的全当成「取消勾选」删掉
  if (error) throw new Error(`读不到管理员：${error.message}`);
  return (data ?? []) as Admin[];
}

/** 每个人是哪几个管理员的客人：person_id → admin_id[] */
export async function loadPersonContacts(): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from("person_contacts").select("person_id, admin_id");
  if (error) throw new Error(`读不到「谁的客人」：${error.message}`);
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    map.set(row.person_id, [...(map.get(row.person_id) ?? []), row.admin_id]);
  }
  return map;
}

async function currentContacts(personId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("person_contacts")
    .select("admin_id")
    .eq("person_id", personId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.admin_id as string);
}

/**
 * 把这个人挂的管理员改成 next 这几个（Customer 管理里勾选用）。
 * 只加新勾的、只删取消勾的，没变的不碰。
 * 先删后加：加的那步失败时，删掉的那几条本来就是要删的，不会把没动的那些带走
 */
export async function saveContacts(personId: string, next: string[]): Promise<void> {
  const { add, remove } = contactsDiff(await currentContacts(personId), next);

  if (remove.length > 0) {
    const { error } = await supabase
      .from("person_contacts")
      .delete()
      .eq("person_id", personId)
      .in("admin_id", remove);
    if (error) throw new Error(error.message);
  }
  if (add.length > 0) {
    const { error } = await supabase
      .from("person_contacts")
      .insert(add.map((admin_id) => ({ person_id: personId, admin_id })));
    if (error) throw new Error(error.message);
  }
}

/**
 * 把这个管理员**补上**（已经有了就不动），别的管理员一个都不碰。
 * 排期总览建单用：Admin1 身份给一个原来是 admin2 加的老客人建单 →
 * 这人变成两个人都有（Admin1 能给他建单，说明 Admin1 也联系得上他）
 */
export async function addContact(personId: string, adminId: string): Promise<void> {
  // 一条 upsert（撞上了就什么都不做），不先查再插 —— 建单那条路上每多一个
  // Supabase 来回就多等 0.4~2 秒
  const { error } = await supabase
    .from("person_contacts")
    .upsert(
      { person_id: personId, admin_id: adminId },
      { onConflict: "person_id,admin_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}
