import { supabase } from "@/lib/supabase";

// 人和身份（迁移 0017）。
//
// 共有的信息 —— 姓名、联系方式、生日、登录账号、状态、备注 —— 在 `people`，只有一份。
// `customers` / `providers` 是身份表，id 就等于 people.id，只放「作为客户 / 物主」才有的东西。
// 「这个人是不是客户」= customers 里有没有他这一行，不另存字段。
//
// 这个文件是两件事的唯一出处：
//   - 查身份表时怎么把人的字段一起带出来（PERSON_SPREAD）
//   - 建一个新的人 + 身份（createPerson）
// 别在页面里各自拼一份 —— 哪天 people 加一列，漏改的那一页就少显示一样东西。

export type Role = "customer" | "provider";

const ROLE_TABLE: Record<Role, "customers" | "providers"> = {
  customer: "customers",
  provider: "providers",
};

/** people 上共有的列。**不含 id / created_at** —— 摊平进身份表那一行时会跟身份表自己的撞名 */
export const PERSON_COLUMNS =
  "first_name, last_name, date_of_birth, email, phone_number, chat, status, note, auth_user_id" as const;

/**
 * 查身份表时把人的字段**摊平**带出来：
 *   from("customers").select(`id, referred_by, ${PERSON_SPREAD}`) → { id, referred_by, first_name, chat, … }
 *   from("orders").select(`…, customers(${PERSON_SPREAD})`)      → { customers: { first_name, … } }
 * 用的是 PostgREST 的 spread（`...people(…)`），返回的形状跟合表之前一模一样，
 * 所以读 `r.first_name`、`o.customers?.first_name` 的地方都不用改。
 */
export const PERSON_SPREAD = `...people(${PERSON_COLUMNS})` as const;

/**
 * 只要几列的时候用：personSpread("first_name, last_name")。
 * 返回值是**字面量类型**：supabase-js 在类型层面解析 select 字符串，给它一个宽泛的
 * `string` 它就解析不出列来，整行变成 ParserError
 */
export function personSpread<C extends string>(columns: C): `...people(${C})` {
  return `...people(${columns})`;
}

export type PersonFields = {
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone_number?: string | null;
  chat?: string | null;
  status?: string;
  note?: string | null;
  auth_user_id?: string | null;
};

/**
 * 建一个新的人，同时给他一个身份。返回 id（人和身份是同一个 id）。
 *
 * 两条 insert 不在一个事务里（supabase-js 没有事务）。身份那条失败时把刚建的人删掉，
 * 不留一个「什么身份都没有」的人在库里 —— 他在哪张列表上都看不见，只会在下次
 * 按邮箱认领时莫名其妙被认领到。
 */
export async function createPerson(
  role: Role,
  fields: PersonFields,
  roleFields: Record<string, unknown> = {}
): Promise<string> {
  const { data: person, error } = await supabase
    .from("people")
    .insert(fields)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = person.id as string;

  const { error: roleError } = await supabase
    .from(ROLE_TABLE[role])
    .insert({ id, ...roleFields });
  if (roleError) {
    await supabase.from("people").delete().eq("id", id);
    throw new Error(roleError.message);
  }
  return id;
}

/**
 * 确保这个人有这个身份（已经有了就什么都不做）。
 * 登录认领用：一个本来只是客户的人从物主入口登录，补一行 providers 就成了物主，
 * 而不是像合表之前那样在 providers 里另起一个「新人」。
 */
export async function ensureRole(personId: string, role: Role): Promise<void> {
  const { error } = await supabase
    .from(ROLE_TABLE[role])
    .upsert({ id: personId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
