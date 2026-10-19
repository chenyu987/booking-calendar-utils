import Link from "next/link";

import FilterForm from "@/app/admin/orders/FilterForm";
import { helpTextStyle, pageTitleStyle, selectStyle, tableStyle, tdStyle, thStyle } from "@/lib/adminStyles";
import {
  aboutFilter,
  buildResolver,
  changedFields,
  fieldLabel,
  formatValue,
  objectLabel,
  OP_LABELS,
  PAGE_SIZE,
  parseAboutId,
  parseBefore,
  parseTable,
  parseWho,
  referencedIds,
  TABLE_LABELS,
  WHO_NONE,
  WHO_SELF,
  type ChangeEntry,
  type Resolver,
} from "@/lib/changeLog";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS, displayName } from "@/lib/person";
import { loadAdmins } from "@/lib/personContacts";
import { supabase } from "@/lib/supabase";
import LocalTime from "./LocalTime";

export const dynamic = "force-dynamic";

// 改动记录（迁移 0025）。库里每一次增删改都由 trigger 记一条，这一页只读。
// 筛选全走 URL 参数：table / who / about（只看跟某个人、某一单、某个资源有关的）/ before（翻页）
export default async function HistoryPage(
  props: {
    searchParams: Promise<{ table?: string; who?: string; about?: string; before?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const admins = await loadAdmins();
  const table = parseTable(searchParams.table);
  const who = parseWho(searchParams.who, admins.map((a) => a.id));
  const about = parseAboutId(searchParams.about);
  const before = parseBefore(searchParams.before);

  let q = supabase
    .from("change_log")
    .select("id, at, table_name, row_id, op, old_row, new_row, admin_id, auth_user_id")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (table) q = q.eq("table_name", table);
  if (who === WHO_SELF) q = q.is("admin_id", null).not("auth_user_id", "is", null);
  else if (who === WHO_NONE) q = q.is("admin_id", null).is("auth_user_id", null);
  else if (who) q = q.eq("admin_id", who);
  if (about) q = q.or(aboutFilter(about));
  if (before) q = q.lt("id", before);

  const { data, error } = await q;
  if (error) throw new Error(`读不到改动记录：${error.message}`);
  const entries = (data ?? []) as ChangeEntry[];

  // 记录里出现的人 / 单 / 资源一次查齐名字。删掉了的查不到，buildResolver 退回记录里的快照
  const ids = referencedIds(entries);
  const authIds = Array.from(new Set(entries.map((e) => e.auth_user_id).filter((v): v is string => !!v)));
  const inList = (s: Set<string>) => Array.from(s);
  const [people, orders, resources, selfPeople] = await Promise.all([
    ids.person.size
      ? supabase.from("people").select(`id, ${DISPLAY_COLUMNS}`).in("id", inList(ids.person))
      : { data: [] },
    ids.order.size
      ? supabase
          .from("orders")
          .select(`id, customer_id, demand_days, location, customers(${personSpread(DISPLAY_COLUMNS)})`)
          .in("id", inList(ids.order))
      : { data: [] },
    ids.resource.size
      ? supabase.from("resources").select("id, holder_name").in("id", inList(ids.resource))
      : { data: [] },
    authIds.length
      ? supabase.from("people").select(`auth_user_id, ${DISPLAY_COLUMNS}`).in("auth_user_id", authIds)
      : { data: [] },
  ]);
  const r = buildResolver(entries, {
    people: (people.data ?? []) as any[],
    orders: ((orders.data ?? []) as any[]).map((o) => ({
      ...o,
      customerName: o.customers ? displayName(o.customers) : undefined,
    })),
    resources: (resources.data ?? []) as any[],
    admins,
  });
  const selfName = new Map(((selfPeople.data ?? []) as any[]).map((p) => [p.auth_user_id, displayName(p)]));

  const hrefWith = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { table, who, about, before: null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/history?${qs}` : "/admin/history";
  };
  const last = entries[entries.length - 1];

  return (
    <main>
      <h1 style={pageTitleStyle}>改动记录</h1>
      <p style={{ ...helpTextStyle, margin: "0 0 8px" }}>
        数据库里每一次新建、修改、删除都会自动记一条。「谁」是改的那一刻排期总览上选的身份；
        没选身份、或者不是从后台改的，就是「不知道」。点对象只看跟它有关的记录。
      </p>

      <FilterForm action="/admin/history" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select name="table" defaultValue={table} style={selectStyle}>
          <option value="">全部表</option>
          {Object.entries(TABLE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select name="who" defaultValue={who} style={selectStyle}>
          <option value="">所有人</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value={WHO_SELF}>客户 / 物主自己</option>
          <option value={WHO_NONE}>不知道</option>
        </select>
        {about && <input type="hidden" name="about" value={about} />}
        {about && (
          <span style={{ fontSize: 13 }}>
            只看：{r.order(about) ?? r.person(about) ?? r.resource(about) ?? about.slice(0, 8)}{" "}
            <Link href={hrefWith({ about: null })} style={{ color: "var(--text-muted)" }}>
              ✕
            </Link>
          </span>
        )}
      </FilterForm>

      {entries.length === 0 ? (
        <p style={helpTextStyle}>{before ? "没有更早的了。" : "还没有记录。"}</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 130 }}>时间</th>
              <th style={{ ...thStyle, width: 90 }}>谁</th>
              <th style={{ ...thStyle, width: 110 }}>操作</th>
              <th style={thStyle}>对象</th>
              <th style={thStyle}>改了什么</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const obj = objectLabel(e, r);
              return (
                <tr key={e.id}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                    <LocalTime iso={e.at} />
                  </td>
                  <td style={tdStyle}>
                    <Who e={e} r={r} selfName={selfName} />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <span style={{ color: e.op === "delete" ? "var(--danger)" : undefined }}>
                      {OP_LABELS[e.op]}
                    </span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                  </td>
                  <td style={tdStyle}>
                    {obj.about && obj.about !== about ? (
                      <Link href={hrefWith({ about: obj.about })} style={{ color: "var(--text)" }}>
                        {obj.text}
                      </Link>
                    ) : (
                      obj.text
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 13 }}>
                    <Changes e={e} r={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {entries.length === PAGE_SIZE && last && (
        <p>
          <Link href={hrefWith({ before: String(last.id) })} style={{ color: "var(--text-muted)", fontSize: 13 }}>
            更早的 →
          </Link>
        </p>
      )}
    </main>
  );
}

function Who({ e, r, selfName }: { e: ChangeEntry; r: Resolver; selfName: Map<string, string> }) {
  if (e.admin_id) return <>{r.admin(e.admin_id) ?? "?"}</>;
  if (e.auth_user_id) {
    return (
      <span title="客户 / 物主自己在页面上改的">
        {selfName.get(e.auth_user_id) ?? "登录用户"}
        <span style={{ color: "var(--text-muted)" }}>（自己）</span>
      </span>
    );
  }
  return <span style={{ color: "var(--text-faint)" }}>不知道</span>;
}

function Changes({ e, r }: { e: ChangeEntry; r: Resolver }) {
  const fields = changedFields(e);
  const fmt = (field: string, v: unknown, row: Record<string, unknown> | null) =>
    formatValue(e.table_name, field, v, row ?? {}, r);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {fields.map((f) => (
        <div key={f.field} style={{ color: e.op === "delete" ? "var(--text-muted)" : undefined }}>
          <span style={{ color: "var(--text-muted)" }}>{fieldLabel(e.table_name, f.field)}：</span>
          {e.op === "update" ? (
            <>
              <span style={{ textDecoration: "line-through", color: "var(--text-faint)" }}>
                {fmt(f.field, f.before, e.old_row)}
              </span>
              {" → "}
              {fmt(f.field, f.after, e.new_row)}
            </>
          ) : (
            fmt(f.field, e.op === "insert" ? f.after : f.before, e.op === "insert" ? e.new_row : e.old_row)
          )}
        </div>
      ))}
    </div>
  );
}
