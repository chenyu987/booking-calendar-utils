"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FOOTPRINT_SORTS,
  FOOTPRINT_SORT_LABELS,
  sortByFootprint,
  summarizeFootprint,
  type FootprintSegment,
  type FootprintSort,
} from "@/lib/footprint";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS } from "@/lib/customerEdit";
import { CONTACT_FILTER_NONE, matchesContactFilter, type Admin } from "@/lib/admins";
import {
  tableStyle,
  thStyle,
  tdStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  linkButtonStyle,
} from "@/lib/adminStyles";

export type CustomerRow = {
  id: string;
  name: string;
  /** 编辑表单的初始值，库里的原样 */
  edit: {
    chat_name: string;
    chat_id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    email: string;
    date_of_birth: string;
    status: string;
    note: string;
  };
  phone: string;
  /** 账号（选填）。name 是显示名（昵称优先，lib/person.ts） */
  chatId: string;
  age: number | null;
  status: string;
  /** 谁介绍来的。空 = 没有介绍人。只读，改在 /admin/referrals */
  referrer: string;
  note: string;
  segments: FootprintSegment[];
  orderCount: number;
  /** 真用了的单数（不算取消/未确认），按「来得最多」排序用 */
  activeOrderCount: number;
  footprintText: string;
  /** 他是哪几个管理员的客人（person_contacts，0018）。空 = 还没标 */
  contactIds: string[];
};

/**
 * 勾「他是谁的客人」。新增表单和编辑那一行共用一份。
 * 两个都勾 = 两行记录，不是一个「都有」的值（见 0018 迁移）
 */
export function ContactCheckboxes({ admins, checked }: { admins: Admin[]; checked: string[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 13 }}>
      {admins.map((a) => (
        <label key={a.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
          <input type="checkbox" name="contact" value={a.id} defaultChecked={checked.includes(a.id)} />
          {a.name}
        </label>
      ))}
    </span>
  );
}

/**
 * 列表里那一格：每个管理员一个小标签，没标的显示「-」。
 * 按管理员列表的顺序画（Admin1 在前），不按库里的行序 —— 不然同样两个人，
 * 这一行「Admin1 admin2」下一行「admin2 Admin1」，扫一眼对不齐
 */
function ContactTags({ ids, admins }: { ids: string[]; admins: Admin[] }) {
  const shown = admins.filter((a) => ids.includes(a.id));
  if (shown.length === 0) return <span style={{ color: "var(--text-faint)" }}>-</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {shown.map((a) => (
        <span
          key={a.id}
          style={{
            padding: "0 6px",
            borderRadius: 3,
            fontSize: 12,
            whiteSpace: "nowrap",
            background: "var(--row-tint)",
            color: "var(--link)",
          }}
        >
          {a.name}
        </span>
      ))}
    </span>
  );
}

/**
 * 足迹那一格：「最早一段 … 最近一段　N 单」一行，点「N 单」浮出全部足迹。
 * 跟 Resource 管理的排期列一个做法（那边的注释讲得更细）：
 *   - 原来是默认露 3 段、点开全部铺在格子里，老客户十几段一展开，那一行撑得老高，整张表没法扫
 *   - **放不下时整段藏掉「最早一段」，不把字截成半截**：DOM 里顺序是「N 单 / 最近 / 最早+连接符」，
 *     row-reverse + wrap 从右往左摆，挤不下的最后一项折到第二行，被固定行高 + overflow:hidden 切掉
 *   - 浮层用原生 <details>，点外面收起：开着时给 summary 铺一张看不见的全屏底板，点底板 = 点 summary
 *
 * 必须走 dangerouslySetInnerHTML：里面有 `>`，写成 <style>{css}</style> 会被 React 转义（CLAUDE.md）
 */
const FP_LINE_HEIGHT = 18;
const footprintCss = `
  .fp { position: relative; }
  .fp > summary { list-style: none; cursor: pointer; }
  .fp > summary::-webkit-details-marker { display: none; }
  .fp-line {
    display: flex; flex-direction: row-reverse; flex-wrap: wrap; justify-content: flex-end;
    align-items: baseline; column-gap: 4px;
    height: ${FP_LINE_HEIGHT}px; line-height: ${FP_LINE_HEIGHT}px; overflow: hidden;
    white-space: nowrap; font-size: 12px;
  }
  .fp-count { color: var(--text-faint); font-size: 11px; margin-left: 6px; border-bottom: 1px dotted var(--border-strong); line-height: 14px; }
  .fp[open] .fp-count { color: var(--link); }
  .fp[open] > summary::after { content: ""; position: fixed; inset: 0; z-index: 5; cursor: default; }
  .fp-pop {
    position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 10;
    min-width: 220px; max-height: 320px; overflow-y: auto; box-sizing: border-box; padding: 6px 10px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--surface); box-shadow: 0 6px 20px rgba(0,0,0,.12);
    font-size: 12px; line-height: 1.9; white-space: nowrap;
  }
`;

/** 一段足迹的字：正常的是链接色，取消/未确认的灰掉划线（「这人黄过一单」本身有用） */
function SegmentText({ s }: { s: FootprintSegment }) {
  return (
    <span
      title={s.inactive ? "已取消或未确认" : undefined}
      style={{
        color: s.inactive ? "var(--text-faint)" : "var(--link)",
        textDecoration: s.inactive ? "line-through" : "none",
      }}
    >
      {s.label}
    </span>
  );
}

function FootprintCell({ r }: { r: CustomerRow }) {
  const { earliest, latest, joiner } = summarizeFootprint(r.segments);
  if (!latest) return <span style={{ color: "var(--text-faint)" }}>-</span>;
  return (
    <details className="fp">
      <summary>
        {/* 顺序是反的，见 footprintCss 的注释 */}
        <div className="fp-line">
          <span className="fp-count">{r.orderCount} 单</span>
          <span>
            <SegmentText s={latest} />
          </span>
          {earliest && (
            <span>
              <SegmentText s={earliest} />
              <span style={{ color: "var(--text-faint)" }}>{joiner === "…" ? " … " : joiner}</span>
            </span>
          )}
        </div>
      </summary>
      <div className="fp-pop">
        {r.segments.map((s, i) => (
          <div key={`${s.start}-${i}`}>
            <SegmentText s={s} />
          </div>
        ))}
      </div>
    </details>
  );
}

// 筛选在客户端做，不走 URL 参数：一季几百人，数据一次全拿回来了，
// 前端过滤是零网络的即时响应；每敲一个字回一次服务端反而更慢。
const filterInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "3px 6px",
  border: "1px solid var(--border)",
  borderRadius: 3,
  fontSize: 12,
};

const filterThStyle: React.CSSProperties = {
  padding: "0 8px 8px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};

const statusLabel = (s: string) => CUSTOMER_STATUS_LABELS[s as keyof typeof CUSTOMER_STATUS_LABELS] ?? s;

/** 编辑态那一行：一整行铺开的表单（<form> 包不住 <tr>，所以放在一个跨满的格子里） */
function EditRow({
  row,
  error,
  action,
  colSpan,
  admins,
}: {
  row: CustomerRow;
  error: string | null;
  action: (formData: FormData) => Promise<void>;
  colSpan: number;
  admins: Admin[];
}) {
  const e = row.edit;
  // 库里要是有不在列表里的老状态值，也放进下拉框，别存的时候被悄悄改掉
  const statuses: string[] = CUSTOMER_STATUSES.includes(e.status as (typeof CUSTOMER_STATUSES)[number])
    ? [...CUSTOMER_STATUSES]
    : [e.status, ...CUSTOMER_STATUSES];
  const field = (label: string, input: React.ReactNode) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--text-muted)" }}>
      {label}
      {input}
    </label>
  );
  return (
    <tr id={`customer-${row.id}`}>
      <td colSpan={colSpan} style={{ ...tdStyle, background: "var(--row-tint)" }}>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 6px" }}>没存上：{error}</p>}
        <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="id" value={row.id} />
          {/* 昵称排第一、必填：认人、显示都靠它。称呼是注册用户自己填的，选填，放后面 */}
          {field("昵称 *", <input name="chat_name" defaultValue={e.chat_name} required style={inputStyle} />)}
          {field("账号", <input name="chat_id" defaultValue={e.chat_id} style={inputStyle} />)}
          {field("电话", <input name="phone_number" defaultValue={e.phone_number} style={inputStyle} />)}
          {field("邮箱", <input name="email" type="email" defaultValue={e.email} style={inputStyle} />)}
          {field("生日", <input name="date_of_birth" type="date" defaultValue={e.date_of_birth} style={inputStyle} />)}
          {field(
            "状态",
            <select name="status" defaultValue={e.status} style={selectStyle}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          )}
          {field("备注", <input name="note" defaultValue={e.note} style={{ ...inputStyle, minWidth: 200 }} />)}
          {field("称呼 First（注册用）", <input name="first_name" defaultValue={e.first_name} style={inputStyle} />)}
          {field("Last", <input name="last_name" defaultValue={e.last_name} style={inputStyle} />)}
          {field("谁的客人", <ContactCheckboxes admins={admins} checked={row.contactIds} />)}
          <button type="submit" style={buttonStyle}>
            保存
          </button>
          {/* scroll={false}：Next 默认每次跳转都滚回页面顶上，表里几百人，改一个就得重新往下翻 */}
          <Link href="/admin/customers" scroll={false} style={{ ...linkButtonStyle, padding: "6px 0" }}>
            取消
          </Link>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "6px 0 0" }}>
          不提供删除（会连带删掉订单和流水）。不用了就把状态改成停用或黑名单。介绍人在「返点」页改。
        </p>
      </td>
    </tr>
  );
}

function matches(value: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return value.toLowerCase().includes(q);
}

export default function CustomerTable({
  rows,
  editingId,
  editError,
  savedId,
  updateAction,
  admins,
}: {
  rows: CustomerRow[];
  /** `?edit=<id>`：这一行显示成编辑表单 */
  editingId: string | null;
  editError: string | null;
  /** `?saved=<id>`：刚存完的那一行，滚回去并闪一下 */
  savedId: string | null;
  updateAction: (formData: FormData) => Promise<void>;
  admins: Admin[];
}) {
  // 保存 / 保存出错都是服务端 redirect 回来的，Next 会把页面滚回顶上（点「编辑」「取消」的
  // 链接可以 scroll={false}，服务端跳转没这个选项）。所以落地后自己滚回那一行
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    const target = savedId ?? (editError ? editingId : null);
    if (!target) return;
    document.getElementById(`customer-${target}`)?.scrollIntoView({ block: "center" });
    if (!savedId) return;
    // 闪一下是 React 状态（行的背景色），不是直接改 DOM，不用操心撤（CLAUDE.md「命令式改了 DOM」那条）
    setFlashId(savedId);
    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [savedId, editingId, editError]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [chat, setChat] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [status, setStatus] = useState("");
  const [referrer, setReferrer] = useState("");
  const [footprint, setFootprint] = useState("");
  // 空 = 不筛；CONTACT_FILTER_NONE = 还没标的；其余是某个管理员的 id
  const [contact, setContact] = useState("");
  // 排序跟筛选一样在客户端做：数据一次全拿回来了，切一下当场重排，不回服务端
  const [sort, setSort] = useState<FootprintSort>("default");

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const min = ageMin.trim() === "" ? null : Number(ageMin);
    const max = ageMax.trim() === "" ? null : Number(ageMax);

    const kept = rows.filter((r) => {
      // 正在编辑的那一行不受筛选影响，不然改着改着被筛掉了
      if (r.id === editingId) return true;
      if (!matches(r.name, name)) return false;
      if (!matches(r.phone, phone)) return false;
      if (!matches(r.chatId, chat)) return false;
      if (!matches(r.referrer, referrer)) return false;
      if (!matches(r.footprintText, footprint)) return false;
      if (status && r.status !== status) return false;
      if (!matchesContactFilter(r.contactIds, contact)) return false;
      // 年龄没填的人：一旦按年龄筛就排除掉，不然「找 25 岁以上」会把没记生日的全捞出来
      if (min !== null || max !== null) {
        if (r.age === null) return false;
        if (min !== null && r.age < min) return false;
        if (max !== null && r.age > max) return false;
      }
      return true;
    });
    return sortByFootprint(kept, sort);
  }, [rows, editingId, name, phone, chat, referrer, footprint, status, contact, ageMin, ageMax, sort]);

  const hasFilter =
    name || phone || chat || referrer || footprint || status || contact || ageMin || ageMax;

  function clearAll() {
    setName("");
    setPhone("");
    setChat("");
    setReferrer("");
    setFootprint("");
    setStatus("");
    setContact("");
    setAgeMin("");
    setAgeMax("");
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: footprintCss }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        <span>
          显示 {filtered.length} / {rows.length} 人
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          按足迹排序
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FootprintSort)}
            style={{ ...filterInputStyle, width: "auto" }}
          >
            {FOOTPRINT_SORTS.map((s) => (
              <option key={s} value={s}>
                {FOOTPRINT_SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {hasFilter && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--text-muted)",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            清空筛选
          </button>
        )}
      </div>

      <table style={{ ...tableStyle, marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, borderBottom: "none", width: "14%" }}>昵称</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>账号</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>电话</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "9%" }}>谁的客人</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "10%" }}>年龄</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "10%" }}>状态</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>介绍人</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>备注</th>
            <th style={{ ...thStyle, borderBottom: "none" }}>足迹</th>
            <th style={{ ...thStyle, borderBottom: "none", width: 48 }}>操作</th>
          </tr>
          <tr>
            <th style={filterThStyle}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="筛选昵称"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="筛选账号"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="筛选电话"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <select value={contact} onChange={(e) => setContact(e.target.value)} style={filterInputStyle}>
                <option value="">全部</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value={CONTACT_FILTER_NONE}>还没标</option>
              </select>
            </th>
            <th style={filterThStyle}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="最小"
                  inputMode="numeric"
                  style={filterInputStyle}
                />
                <span style={{ color: "var(--text-faint)", fontSize: 12 }}>~</span>
                <input
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="最大"
                  inputMode="numeric"
                  style={filterInputStyle}
                />
              </div>
            </th>
            <th style={filterThStyle}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={filterInputStyle}
              >
                <option value="">全部</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </th>
            <th style={filterThStyle}>
              <input
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
                placeholder="筛选介绍人"
                style={filterInputStyle}
              />
            </th>
            {/* 备注不给筛选框：内容太散，真要找人用姓名/电话/足迹更快 */}
            <th style={filterThStyle} />
            <th style={filterThStyle}>
              <input
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
                placeholder="筛选地点或日期，如 locbl / 1/18"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle} />
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            if (r.id === editingId) {
              return <EditRow
                  key={r.id}
                  row={r}
                  error={editError}
                  action={updateAction}
                  colSpan={10}
                  admins={admins}
                />;
            }
            return (
              <tr
                key={r.id}
                id={`customer-${r.id}`}
                style={{
                  background: r.id === flashId ? "var(--row-tint)" : undefined,
                  transition: "background 0.6s",
                }}
              >
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>{r.chatId}</td>
                <td style={tdStyle}>{r.phone}</td>
                <td style={tdStyle}>
                  <ContactTags ids={r.contactIds} admins={admins} />
                </td>
                <td style={tdStyle}>{r.age ?? "-"}</td>
                <td style={tdStyle}>{statusLabel(r.status)}</td>
                <td style={tdStyle}>
                  {r.referrer || <span style={{ color: "var(--text-faint)" }}>-</span>}
                </td>
                <td style={tdStyle}>{r.note}</td>
                <td style={tdStyle}>
                  <FootprintCell r={r} />
                </td>
                <td style={tdStyle}>
                  <Link href={`/admin/customers?edit=${r.id}`} scroll={false} style={linkButtonStyle}>
                    编辑
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {filtered.length === 0 && rows.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>没有符合筛选条件的 Customer</p>
      )}
    </>
  );
}
