// 改动记录（迁移 0025）的纯逻辑：哪几个字段变了、值怎么显示成人话、这一条说的是谁。
//
// 库里每条存的是改之前 / 之后的**整行快照**，「改了什么」在这里现算 —— 能算的不存。
// 不碰数据库：页面把要用的人 / 单 / 资源查好，通过 Resolver 递进来。

import { formatDayRanges } from "./dates";
import { matchDisplay } from "./matchStatus";
import { STATUS_LABELS } from "./orderStatus";
import { displayName, type Nameable } from "./person";
import { formatValidity, RESOURCE_STATUS_LABELS } from "./resourceStatus";

export type ChangeOp = "insert" | "update" | "delete";
export type Row = Record<string, unknown>;

export type ChangeEntry = {
  id: number;
  at: string;
  table_name: string;
  row_id: string;
  op: ChangeOp;
  old_row: Row | null;
  new_row: Row | null;
  admin_id: string | null;
  auth_user_id: string | null;
};

export const TABLE_LABELS: Record<string, string> = {
  orders: "订单",
  order_assignments: "分配",
  order_notes: "订单备注",
  payments: "付款",
  resources: "资源",
  matches: "意向",
  people: "人",
  customers: "客户身份",
  providers: "物主身份",
  person_contacts: "谁的客人",
  referral_payouts: "返点付款",
  admins: "管理员",
  day_notes: "日历备注",
  app_settings: "设置",
};

export const OP_LABELS: Record<ChangeOp, string> = { insert: "新建", update: "修改", delete: "删除" };

// 顺序就是显示顺序：一条记录里先说「谁的 / 哪一单 / 哪个资源」，再说内容，状态和归属放后面。
// jsonb 里的键是按长度排的（「状态、地点、客户、男、日期、女」），直接照着列读着很乱
const FIELD_LABELS: Record<string, string> = {
  customer_id: "客户",
  provider_id: "物主",
  person_id: "客人",
  referrer_id: "返给",
  order_id: "订单",
  resource_id: "资源",
  demand_days: "日期",
  location: "地点",
  male_count: "男",
  female_count: "女",
  amount: "金额",
  method: "方式",
  chat_name: "昵称",
  chat_id: "账号",
  first_name: "名",
  last_name: "姓",
  date_of_birth: "生日",
  email: "邮箱",
  phone_number: "电话",
  address_line1: "地址",
  address_line2: "地址第二行",
  city: "城市",
  region: "州 / 省",
  postal_code: "邮编",
  country: "国家",
  name: "名字",
  item_type: "类型",
  holder_name: "持有人",
  holder_gender: "持有人性别",
  holder_date_of_birth: "持有人生日",
  validity: "有效期",
  referred_by: "介绍人",
  referral_rate: "返点比例",
  referral_from: "返点起",
  referral_until: "返点止",
  pickup_method: "取资源方式",
  sales_channel: "渠道",
  special_request: "特殊要求",
  internal_note: "内部备注",
  refund_note: "退款备注",
  day: "日期",
  key: "设置项",
  value: "值",
  note: "备注",
  status: "状态",
  admin_id: "管理员",
  deleted_at: "已删除",
  auth_user_id: "登录账号",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS);
const fieldRank = (f: string) => {
  const i = FIELD_ORDER.indexOf(f);
  return i === -1 ? FIELD_ORDER.length : i;
};

/** 订单上的 admin_id 是「谁的单」，跟 person_contacts 上那个「哪个管理员的客人」说的不是一回事 */
export function fieldLabel(table: string, field: string): string {
  if (table === "orders" && field === "admin_id") return "谁的单";
  return FIELD_LABELS[field] ?? field;
}

/**
 * 不显示的列。主键、时间戳本来就不是「改了什么」；
 * party_size 是生成列（男 + 女），男女那两列变了它跟着变，再列一遍是重复
 */
const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "party_size"]);

export type FieldChange = { field: string; before: unknown; after: unknown };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/**
 * 这一条改了哪些字段。
 * 修改：前后不一样的那几列。新建 / 删除：有值的那几列（删除时这就是「删掉的是什么」，
 * 删错了能照着补回去）
 */
export function changedFields(e: Pick<ChangeEntry, "op" | "old_row" | "new_row">): FieldChange[] {
  const before = e.old_row ?? {};
  const after = e.new_row ?? {};
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return fields
    .filter((f) => !HIDDEN_FIELDS.has(f))
    .filter((f) =>
      e.op === "update" ? !same(before[f], after[f]) : !isBlank(e.op === "insert" ? after[f] : before[f])
    )
    .sort((a, b) => fieldRank(a) - fieldRank(b))
    .map((f) => ({ field: f, before: before[f], after: after[f] }));
}

/** 这几列存的是别的表的 id，显示时换成名字 */
const FK_KIND: Record<string, "person" | "order" | "resource" | "admin"> = {
  customer_id: "person",
  provider_id: "person",
  person_id: "person",
  referred_by: "person",
  referrer_id: "person",
  order_id: "order",
  resource_id: "resource",
  admin_id: "admin",
};

/** 把 id 换成人能认的名字。认不出（已经删了、没查到）返回 undefined */
export type Resolver = {
  person: (id: string) => string | undefined;
  order: (id: string) => string | undefined;
  resource: (id: string) => string | undefined;
  admin: (id: string) => string | undefined;
};

const PAYMENT_STATUS: Record<string, string> = { pending: "待付", paid: "已付", refunded: "已退" };
const GENDER: Record<string, string> = { male: "男", female: "女" };

function statusLabel(table: string, v: string): string {
  if (table === "orders") return STATUS_LABELS[v] ?? v;
  if (table === "resources") return RESOURCE_STATUS_LABELS[v] ?? v;
  if (table === "matches") return matchDisplay(v).label;
  if (table === "payments") return PAYMENT_STATUS[v] ?? v;
  return v;
}

const shortId = (id: string) => id.slice(0, 8);

/** 一个值显示成什么样。row 是这个值所在的那一行（app_settings 的 value 要看 key 才知道是什么） */
export function formatValue(table: string, field: string, v: unknown, row: Row, r: Resolver): string {
  if (isBlank(v)) return "空";
  const kind = FK_KIND[field];
  if (kind && typeof v === "string") return r[kind](v) ?? `已删除（${shortId(v)}）`;
  if (table === "app_settings" && field === "value" && row.key === "primary_admin_id" && typeof v === "string") {
    return r.admin(v) ?? v;
  }
  if (field === "status" && typeof v === "string") return statusLabel(table, v);
  if (field === "demand_days" && Array.isArray(v)) return formatDayRanges([...(v as string[])].sort());
  if (field === "validity") return formatValidity({ validity: v });
  if (field === "holder_gender" && typeof v === "string") return GENDER[v] ?? v;
  if (field === "referral_rate") return `${Math.round(Number(v) * 1000) / 10}%`;
  if (field === "amount") return `$${Number(v).toLocaleString()}`;
  if (field === "deleted_at" && typeof v === "string") return v.slice(0, 10);
  if (field === "auth_user_id") return "已绑定";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 这一条说的是谁 / 哪一单。about = 点它之后「只看跟它有关的记录」用哪个 id */
export function objectLabel(e: ChangeEntry, r: Resolver): { text: string; about?: string } {
  const row = e.new_row ?? e.old_row ?? {};
  const str = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : undefined);
  const person = (id?: string) => (id ? r.person(id) ?? `已删除的人（${shortId(id)}）` : "?");
  const order = (id?: string) => (id ? r.order(id) ?? `已删除的单（${shortId(id)}）` : "?");
  const resource = (id?: string) => (id ? r.resource(id) ?? `已删除的资源（${shortId(id)}）` : "?");

  switch (e.table_name) {
    case "people":
    case "customers":
    case "providers":
      return { text: person(e.row_id), about: e.row_id };
    case "person_contacts":
      return {
        text: `${person(str("person_id"))} · ${r.admin(str("admin_id") ?? "") ?? "?"}`,
        about: str("person_id"),
      };
    case "orders":
      return { text: order(e.row_id), about: e.row_id };
    case "order_assignments":
    case "matches":
      return {
        text: `${order(str("order_id"))} ← ${resource(str("resource_id"))}`,
        about: str("order_id"),
      };
    case "payments":
    case "order_notes":
      return { text: order(str("order_id")), about: str("order_id") };
    case "referral_payouts":
      return {
        text: `${order(str("order_id"))} → 返给 ${person(str("referrer_id"))}`,
        about: str("order_id"),
      };
    case "resources":
      return { text: resource(e.row_id), about: e.row_id };
    case "admins":
      return { text: str("name") ?? e.row_id };
    default:
      // day_notes / app_settings：主键本身就是人能读的（日期、设置项的名字）
      return { text: e.row_id };
  }
}

/** 页面要查名字的那些 id，从记录里一次收齐 */
export function referencedIds(entries: ChangeEntry[]) {
  const ids = { person: new Set<string>(), order: new Set<string>(), resource: new Set<string>(), admin: new Set<string>() };
  const ROW_KIND: Record<string, keyof typeof ids> = {
    people: "person",
    customers: "person",
    providers: "person",
    orders: "order",
    resources: "resource",
    admins: "admin",
  };
  for (const e of entries) {
    const own = ROW_KIND[e.table_name];
    if (own) ids[own].add(e.row_id);
    if (e.admin_id) ids.admin.add(e.admin_id);
    for (const row of [e.old_row, e.new_row]) {
      if (!row) continue;
      for (const [field, kind] of Object.entries(FK_KIND)) {
        const v = row[field];
        if (typeof v === "string") ids[kind].add(v);
      }
    }
  }
  return ids;
}

export type OrderRef = { customer_id?: unknown; demand_days?: unknown; location?: unknown; customerName?: string };

export function orderText(o: OrderRef, customerName: string | undefined): string {
  const days = Array.isArray(o.demand_days) ? formatDayRanges([...(o.demand_days as string[])].sort()) : "";
  return [customerName ?? "?", days, typeof o.location === "string" ? o.location : ""].filter(Boolean).join(" ");
}

export function resourceText(s: { holder_name?: unknown }): string {
  return `${typeof s.holder_name === "string" && s.holder_name ? s.holder_name : "?"} 的资源`;
}

/**
 * 拼一个 Resolver。查不到的（已经删了）退回记录里自己留的那份快照 ——
 * 删掉一单之后，删除那条记录的 old_row 里还有客户和日期，照样能说清楚删的是哪一单
 */
export function buildResolver(
  entries: ChangeEntry[],
  live: {
    people: ({ id: string } & NonNullable<Nameable>)[];
    orders: ({ id: string } & OrderRef)[];
    resources: { id: string; holder_name?: unknown }[];
    admins: { id: string; name: string }[];
  }
): Resolver {
  const people = new Map<string, Nameable>();
  const orders = new Map<string, OrderRef>();
  const resources = new Map<string, { holder_name?: unknown }>();
  // 先放快照（旧的在前，新的盖上去），再用库里现在的盖掉
  for (const e of [...entries].sort((a, b) => a.id - b.id)) {
    const row = e.new_row ?? e.old_row;
    if (!row) continue;
    if (e.table_name === "people") people.set(e.row_id, row as Nameable);
    if (e.table_name === "orders") orders.set(e.row_id, row);
    if (e.table_name === "resources") resources.set(e.row_id, row);
  }
  for (const p of live.people) people.set(p.id, p);
  for (const o of live.orders) orders.set(o.id, o);
  for (const s of live.resources) resources.set(s.id, s);
  const admins = new Map(live.admins.map((a) => [a.id, a.name]));

  const person = (id: string) => {
    const p = people.get(id);
    return p ? displayName(p) : undefined;
  };
  return {
    person,
    order: (id) => {
      const o = orders.get(id);
      if (!o) return undefined;
      return orderText(o, o.customerName ?? (typeof o.customer_id === "string" ? person(o.customer_id) : undefined));
    },
    resource: (id) => {
      const s = resources.get(id);
      return s ? resourceText(s) : undefined;
    },
    admin: (id) => admins.get(id),
  };
}

// ---- 筛选（URL 参数）----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 「只看跟它有关的」：一个人、一单或一个资源的 id。不像 uuid 的当没传 —— 它要拼进查询串 */
export function parseAboutId(raw: string | undefined): string | null {
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/** 别的表上指着它的那几列。跟一单有关的 = 这一单本身 + 分配 / 付款 / 意向 / 备注 / 返点 */
const ABOUT_FIELDS = ["order_id", "resource_id", "person_id", "customer_id", "provider_id", "referrer_id"];

/** PostgREST 的 or 条件：主键是它，或者改之前 / 之后的哪一列指着它 */
export function aboutFilter(id: string): string {
  return [
    `row_id.eq.${id}`,
    ...ABOUT_FIELDS.flatMap((f) => [`new_row->>${f}.eq.${id}`, `old_row->>${f}.eq.${id}`]),
  ].join(",");
}

/** 「谁改的」筛选：某个管理员的 id / 客户物主自己（self）/ 不知道（none）/ 不筛（""） */
export const WHO_SELF = "self";
export const WHO_NONE = "none";
export function parseWho(raw: string | undefined, adminIds: string[]): string {
  if (raw === WHO_SELF || raw === WHO_NONE) return raw;
  return raw && adminIds.includes(raw) ? raw : "";
}

export function parseTable(raw: string | undefined): string {
  return raw && raw in TABLE_LABELS ? raw : "";
}

/** 一页多少条。往前翻用 before=<上一页最后一条的 id> */
export const PAGE_SIZE = 100;

export function parseBefore(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
