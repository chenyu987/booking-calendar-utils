"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FOOTPRINT_SORTS,
  FOOTPRINT_SORT_LABELS,
  groupSegmentsBySeason,
  sortByFootprint,
  summarizeFootprint,
  type FootprintSegment,
  type FootprintSort,
  type CustomerSeason,
} from "@/lib/footprint";
import { DATE_INPUT_MAX } from "@/lib/dates";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS, parseCustomerEdit, customerRowAfterEdit } from "@/lib/customerEdit";
import { CONTACT_FILTER_NONE, matchesContactFilter, parseAdminIds, type Admin } from "@/lib/admins";
import { adminTagColors } from "@/lib/orderFrame";
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
  /** 昵称 */
  name: string;
  /** 用户自己注册时填的称呼（名 + 姓），没有是空串。显示在昵称旁边 */
  selfName: string;
  /** 编辑表单的初始值，库里的原样 */
  edit: {
    chat_name: string;
    chat_id: string;
    phone_number: string;
    email: string;
    date_of_birth: string;
    status: string;
    note: string;
  };
  /** 账号（选填）。name 是显示名（昵称优先，lib/person.ts） */
  chatId: string;
  age: number | null;
  status: string;
  /** 谁介绍来的。空 = 没有介绍人。只读，改在 /admin/referrals */
  referrer: string;
  note: string;
  segments: FootprintSegment[];
  /** 去过哪几季，新的在前（按订单现算，lib/footprint.ts）。空 = 没下过单 */
  seasons: CustomerSeason[];
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
export function ContactCheckboxes({
  admins,
  checked,
  form,
}: {
  admins: Admin[];
  checked: string[];
  /** 勾选框不在 <form> 里面时（编辑那一行，见 EditRow），用 form 属性挂到那张表单上 */
  form?: string;
}) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: 10, alignItems: "center", fontSize: 13 }}>
      {admins.map((a) => (
        <label key={a.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
          <input type="checkbox" name="contact" value={a.id} defaultChecked={checked.includes(a.id)} form={form} />
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
 *
 * 传了 primaryId（Provider 管理传）：非主要管理员的标签按 adminTagColors 上色（Admin1 = 浅玫红），
 * 跟排期总览上他的单子边框一个色系；主要管理员照旧。不传就全是原来那个样子（Customer 管理）
 */
export function ContactTags({
  ids,
  admins,
  primaryId,
}: {
  ids: string[];
  admins: Admin[];
  primaryId?: string | null;
}) {
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
            ...(primaryId !== undefined ? adminTagColors(a.id, admins, primaryId) : null),
          }}
        >
          {a.name}
        </span>
      ))}
    </span>
  );
}

/**
 * 季那一格：去过哪几季，一季一个小标签，新的在前（跟「谁的客人」一个样子）。
 * 这季的单全是取消/未确认的，标签灰掉划线 —— 跟足迹里黄掉的单同一个画法。
 * 季多了不把格子撑开：超过 3 个只露最近 2 个，后面「+N」，鼠标停上去看全部
 */
const SEASON_TAGS_SHOWN = 2;
/** 季筛选里「没下过单」那一档。不会跟季 key（25-26-na）撞 */
const SEASON_FILTER_NONE = "none";
function SeasonTags({ seasons }: { seasons: CustomerSeason[] }) {
  if (seasons.length === 0) return <span style={{ color: "var(--text-faint)" }}>-</span>;
  const shown = seasons.length > SEASON_TAGS_SHOWN + 1 ? seasons.slice(0, SEASON_TAGS_SHOWN) : seasons;
  const rest = seasons.length - shown.length;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {shown.map((s) => (
        <span
          key={s.key}
          title={s.inactive ? "这季的单都取消了或没确认" : undefined}
          style={{
            padding: "0 6px",
            borderRadius: 3,
            fontSize: 12,
            whiteSpace: "nowrap",
            background: "var(--row-tint)",
            color: s.inactive ? "var(--text-faint)" : "var(--link)",
            textDecoration: s.inactive ? "line-through" : "none",
          }}
        >
          {s.label}
        </span>
      ))}
      {rest > 0 && (
        <span
          title={seasons.map((s) => s.label).join("、")}
          style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap" }}
        >
          +{rest}
        </span>
      )}
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
  .fp-season {
    font-size: 11px; font-weight: 600; color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  .fp-group + .fp-group .fp-season { margin-top: 4px; }
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
      {/* 按季分组：段上只写「月/日」，不分季认不出是哪年；跟左边季那列同一套叫法（lib/footprint.ts） */}
      <div className="fp-pop">
        {groupSegmentsBySeason(r.segments).map((g) => (
          <div key={g.season.key} className="fp-group">
            <div className="fp-season">{g.season.label}</div>
            {g.segments.map((s, i) => (
              <div key={`${s.start}-${i}`}>
                <SegmentText s={s} />
              </div>
            ))}
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

// 昵称 / 账号那两列收窄了。库里不少是一长串连着的字母（「Ianyyyyyyy」），表格不会
// 在单词中间折行，一个长名字就把整列撑回去，表头写的宽度等于白写 —— 所以允许在任意位置折
const narrowTdStyle: React.CSSProperties = { ...tdStyle, overflowWrap: "anywhere" };

const statusLabel = (s: string) => CUSTOMER_STATUS_LABELS[s as keyof typeof CUSTOMER_STATUS_LABELS] ?? s;

/**
 * 编辑态：**每个输入框就在它自己那一列底下**，跟上面的表头、上下的行对齐 ——
 * 原来是一整行铺开的表单，自己排自己的，一进编辑跟表头全对不上。
 *
 * <form> 包不住 <tr>，所以表单本体放在「操作」那一格（里面是隐藏的 id 和保存按钮），
 * 别的格子里的输入框用 form 属性挂到这张表单上 —— 提交时浏览器照样把它们收进 FormData，
 * 服务端那边一个字不用改。
 *
 * 能改的列放输入框；改不了的（季、介绍人、足迹）照原样显示，不留空。
 * 年龄那一列放生日（年龄就是生日算出来的）。电话、邮箱在列表里没有列，
 * 放在紧跟着的第二行，连同那句「不提供删除」
 */
function EditRow({
  row,
  error,
  action,
  onSubmit,
  onCancel,
  colSpan,
  admins,
}: {
  row: CustomerRow;
  error: string | null;
  /** JS 没跑起来时的退路（Server Action）。平时走 onSubmit */
  action: (formData: FormData) => Promise<void>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  colSpan: number;
  admins: Admin[];
}) {
  const e = row.edit;
  const formId = `customer-edit-${row.id}`;
  // 库里要是有不在列表里的老状态值，也放进下拉框，别存的时候被悄悄改掉
  const statuses: string[] = CUSTOMER_STATUSES.includes(e.status as (typeof CUSTOMER_STATUSES)[number])
    ? [...CUSTOMER_STATUSES]
    : [e.status, ...CUSTOMER_STATUSES];
  const editTd: React.CSSProperties = { ...tdStyle, background: "var(--row-tint)" };
  // 输入框撑满自己那一格：width 100% 必须配 border-box，不然内边距 + 边框让它比格子宽一截
  const cellInput: React.CSSProperties = { ...inputStyle, width: "100%", boxSizing: "border-box", minWidth: 0 };
  const label = (text: string) => (
    <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{text}</span>
  );
  return (
    <>
      <tr id={`customer-${row.id}`}>
        {/* 昵称必填：认人、显示都靠它 */}
        <td style={editTd}>
          <input name="chat_name" form={formId} defaultValue={e.chat_name} required aria-label="昵称" style={cellInput} />
        </td>
        <td style={editTd}>
          <input name="chat_id" form={formId} defaultValue={e.chat_id} aria-label="账号" style={cellInput} />
        </td>
        <td style={editTd}>
          <SeasonTags seasons={row.seasons} />
        </td>
        <td style={editTd}>
          <ContactCheckboxes admins={admins} checked={row.contactIds} form={formId} />
        </td>
        <td style={editTd}>
          <input name="date_of_birth" type="date" max={DATE_INPUT_MAX} form={formId} defaultValue={e.date_of_birth} aria-label="生日" style={cellInput} />
        </td>
        <td style={editTd}>
          <select name="status" form={formId} defaultValue={e.status} aria-label="状态" style={{ ...selectStyle, width: "100%", boxSizing: "border-box" }}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </td>
        <td style={editTd}>{row.referrer || <span style={{ color: "var(--text-faint)" }}>-</span>}</td>
        <td style={editTd}>
          <input name="note" form={formId} defaultValue={e.note} aria-label="备注" style={cellInput} />
        </td>
        <td style={editTd}>
          <FootprintCell r={row} />
        </td>
        <td style={editTd}>
          <form id={formId} action={action} onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" style={{ ...buttonStyle, padding: "4px 10px" }}>
              保存
            </button>
            {/* scroll={false}：Next 默认每次跳转都滚回页面顶上，表里几百人，改一个就得重新往下翻 */}
            <Link href="/admin/customers" scroll={false} onClick={onCancel} style={linkButtonStyle}>
              取消
            </Link>
          </form>
        </td>
      </tr>
      <tr>
        <td colSpan={colSpan} style={{ ...editTd, paddingTop: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>没存上：{error}</span>}
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {label("电话")}
              <input name="phone_number" form={formId} defaultValue={e.phone_number} style={inputStyle} />
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {label("邮箱")}
              <input name="email" type="email" form={formId} defaultValue={e.email} style={inputStyle} />
            </label>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              不提供删除（会连带删掉订单和流水）。不用了就把状态改成停用或黑名单。介绍人在「返点」页改。
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}

function matches(value: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return value.toLowerCase().includes(q);
}

export default function CustomerTable({
  rows,
  editingId: initialEditingId,
  editError: initialEditError,
  savedId,
  updateAction,
  admins,
  today,
}: {
  rows: CustomerRow[];
  /** `?edit=<id>`：打开页面时这一行就是编辑态（刷新 / 分享链接 / JS 没跑起来时的退路） */
  editingId: string | null;
  editError: string | null;
  /** `?saved=<id>`：刚存完的那一行，滚回去并闪一下（JS 没跑起来、走 Server Action 那条路才有） */
  savedId: string | null;
  updateAction: (formData: FormData) => Promise<void>;
  admins: Admin[];
  /** 今天，服务端给的（客户端自己算会跟服务端差一天，CLAUDE.md「今天是哪天」） */
  today: string;
}) {
  // ── 编辑：全在客户端，不回服务端 ──────────────────────────────────────────
  // 进编辑态要的数据（每一行的初始值）本来就在 rows 里，回一趟服务端纯属白等 ——
  // 这一页渲染一次要好几秒（全量拉订单算足迹）。所以点「编辑」「取消」只是切状态，
  // 地址栏用 replaceState 跟着变，刷新 / 分享链接照旧。
  // 点「保存」：先用同一份校验（lib/customerEdit.ts）当场验，验过了这一行**当场**画成新值、
  // 退出编辑态，真正写库在后台（save/route.ts）。存不上就撤回原值、重新打开编辑态把原因
  // 写出来 —— 不能让人以为存好了。
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);
  const [editError, setEditError] = useState<string | null>(initialEditError);
  useEffect(() => {
    setEditingId(initialEditingId);
    setEditError(initialEditError);
  }, [initialEditingId, initialEditError]);
  // 点了保存、先画上去的新值：id → 这一行要盖掉的字段
  const [patches, setPatches] = useState<ReadonlyMap<string, Partial<CustomerRow>>>(new Map());
  // 存不上、重新打开编辑态时表单里放**刚才打的**，不是库里的 —— 不然打的字白打
  const [draft, setDraft] = useState<{ id: string; edit: CustomerRow["edit"]; contactIds: string[] } | null>(null);
  // 还在后台存的行；同一行连着存两次要排队，不然后发的可能先到，库里留下的是前一次的
  const pending = useRef(new Map<string, Promise<unknown>>());

  // 服务端数据换了（比如新增了一个人，整页重新渲染）：存完了的补丁撤掉，以库里为准；还在存的留着
  useEffect(() => {
    setPatches((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map([...prev].filter(([id]) => pending.current.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // 后台还在存的时候关页面 / 刷新：拦一下。站内跳到别的页不用拦 —— 请求是 keepalive 的，照样送到
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const setUrl = (id: string | null) =>
    window.history.replaceState(null, "", id ? `/admin/customers?edit=${id}` : "/admin/customers");

  // ⌘ / 中键是「新标签页打开」，交给链接自己，这一页什么都不动
  const isPlainClick = (e: React.MouseEvent) =>
    !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

  function startEdit(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (!isPlainClick(e)) return;
    // next/link 看到 defaultPrevented 就不导航（处理器挂在链接自己身上，不是外层，冒泡阶段就够）
    e.preventDefault();
    setEditingId(id);
    setEditError(null);
    setDraft(null);
    setUrl(id);
  }

  function cancelEdit(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    setEditingId(null);
    setEditError(null);
    setDraft(null);
    setUrl(null);
  }

  function saveEdit(e: React.FormEvent<HTMLFormElement>, row: CustomerRow) {
    e.preventDefault();
    // 挂在这张表单上的输入框（form 属性）也会被收进来，跟原来提交给 Server Action 的是同一份
    const fd = new FormData(e.currentTarget);
    const parsed = parseCustomerEdit((k) => fd.get(k) as string | null, today);
    if ("error" in parsed) return setEditError(parsed.error);
    const contacts = parseAdminIds(fd.getAll("contact"), admins);
    if (!contacts.ok) return setEditError(contacts.reason);

    const id = row.id;
    const before = patches.get(id);
    const patch = customerRowAfterEdit(parsed.values, contacts.ids);
    setPatches((prev) => new Map(prev).set(id, patch));
    setEditingId(null);
    setEditError(null);
    setDraft(null);
    setUrl(null);
    flash(id);

    const prevSave = pending.current.get(id) ?? Promise.resolve();
    const save = prevSave
      .catch(() => {})
      .then(async () => {
        const res = await fetch("/admin/customers/save", { method: "POST", body: fd, keepalive: true });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
      });
    pending.current.set(id, save);
    save
      .catch((err: any) => {
        // 撤回：这一行回到存之前的样子，重新打开编辑态，表单里是刚才打的，并说出为什么
        setPatches((prev) => {
          const next = new Map(prev);
          if (before) next.set(id, before);
          else next.delete(id);
          return next;
        });
        setDraft({ id, edit: patch.edit, contactIds: contacts.ids });
        setEditingId(id);
        setEditError(err?.message ?? String(err));
        setUrl(id);
        requestAnimationFrame(() =>
          document.getElementById(`customer-${id}`)?.scrollIntoView({ block: "center" })
        );
      })
      .finally(() => {
        if (pending.current.get(id) === save) pending.current.delete(id);
      });
  }

  // 先画上去的新值盖在服务端那份上。筛选、排序、计数都看这一份，存完立刻按新值筛
  const view = useMemo(
    () => (patches.size === 0 ? rows : rows.map((r) => (patches.has(r.id) ? { ...r, ...patches.get(r.id) } : r))),
    [rows, patches]
  );

  // 保存 / 保存出错都是服务端 redirect 回来的，Next 会把页面滚回顶上（点「编辑」「取消」的
  // 链接可以 scroll={false}，服务端跳转没这个选项）。所以落地后自己滚回那一行
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 闪一下是 React 状态（行的背景色），不是直接改 DOM，不用操心撤（CLAUDE.md「命令式改了 DOM」那条）
  function flash(id: string) {
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 2000);
  }
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  useEffect(() => {
    const target = savedId ?? (initialEditError ? initialEditingId : null);
    if (!target) return;
    document.getElementById(`customer-${target}`)?.scrollIntoView({ block: "center" });
    if (savedId) flash(savedId);
    // 只在服务端跳转回来时跑（Server Action 那条退路），客户端切编辑态不该滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId, initialEditingId, initialEditError]);

  const [name, setName] = useState("");
  const [chat, setChat] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [status, setStatus] = useState("");
  const [referrer, setReferrer] = useState("");
  const [footprint, setFootprint] = useState("");
  // 空 = 不筛；CONTACT_FILTER_NONE = 还没标的；其余是某个管理员的 id
  const [contact, setContact] = useState("");
  // 空 = 不筛；SEASON_FILTER_NONE = 没下过单的；其余是季 key（25-26-na）
  const [season, setSeason] = useState("");
  // 排序跟筛选一样在客户端做：数据一次全拿回来了，切一下当场重排，不回服务端
  const [sort, setSort] = useState<FootprintSort>("default");

  const statuses = useMemo(
    () => [...new Set(view.map((r) => r.status).filter(Boolean))].sort(),
    [view]
  );
  // 季筛选的选项：表里实际出现过的季，新的在前
  const seasonOptions = useMemo(() => {
    const byKey = new Map<string, CustomerSeason>();
    for (const r of view) for (const s of r.seasons) if (!byKey.has(s.key)) byKey.set(s.key, s);
    return [...byKey.values()].sort((a, b) => b.start.localeCompare(a.start));
  }, [view]);

  const filtered = useMemo(() => {
    const min = ageMin.trim() === "" ? null : Number(ageMin);
    const max = ageMax.trim() === "" ? null : Number(ageMax);

    const kept = view.filter((r) => {
      // 正在编辑的那一行不受筛选影响，不然改着改着被筛掉了
      if (r.id === editingId) return true;
      // 昵称、称呼都能搜
      if (!matches(`${r.name} ${r.selfName}`, name)) return false;
      if (!matches(r.chatId, chat)) return false;
      if (!matches(r.referrer, referrer)) return false;
      if (!matches(r.footprintText, footprint)) return false;
      if (status && r.status !== status) return false;
      if (!matchesContactFilter(r.contactIds, contact)) return false;
      // 两季都来过的人，选哪一季都在。灰掉的（那季只黄过单）也算 —— 标签上看得到它，筛出来才对得上
      if (season === SEASON_FILTER_NONE ? r.seasons.length > 0 : season && !r.seasons.some((s) => s.key === season)) {
        return false;
      }
      // 年龄没填的人：一旦按年龄筛就排除掉，不然「找 25 岁以上」会把没记生日的全捞出来
      if (min !== null || max !== null) {
        if (r.age === null) return false;
        if (min !== null && r.age < min) return false;
        if (max !== null && r.age > max) return false;
      }
      return true;
    });
    return sortByFootprint(kept, sort);
  }, [view, editingId, name, chat, referrer, footprint, status, contact, season, ageMin, ageMax, sort]);

  const hasFilter =
    name || chat || referrer || footprint || status || contact || season || ageMin || ageMax;

  function clearAll() {
    setName("");
    setChat("");
    setReferrer("");
    setFootprint("");
    setStatus("");
    setContact("");
    setSeason("");
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

      {/* tableLayout fixed：列宽只听表头的，不跟着内容变。不然一进编辑，生日框、保存按钮
          把各自那列撑宽，整张表的列都挪几像素 —— 进出编辑几何必须一模一样（CLAUDE.md） */}
      <table style={{ ...tableStyle, marginTop: 8, tableLayout: "fixed" }}>
        <thead>
          <tr>
            {/* 列宽**只在这一行定**（tableLayout fixed，下面的行都听它的）。百分比是内容宽，
                每列还要加上左右内边距，所以加起来只到 70% 左右 —— 剩下的给不写宽度的「足迹」。
                写满 100% 的话足迹那列会被挤得只剩十几像素。
                昵称 / 账号收窄了（2026-10-08），腾给季那列；长名字会折行，不截断 */}
            <th style={{ ...thStyle, borderBottom: "none", width: "9%" }}>昵称</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "7%" }}>账号</th>
            {/* 电话不在列表里单独占一列（2026-10-08 去掉的）。数据还在，要看/改点「编辑」 */}
            <th style={{ ...thStyle, borderBottom: "none", width: "11.5%" }}>季</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "8%" }}>谁的客人</th>
            {/* 年龄这列进编辑时放生日输入框，别再窄了 */}
            <th style={{ ...thStyle, borderBottom: "none", width: "9%" }}>年龄</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "7%" }}>状态</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "9%" }}>介绍人</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "10%" }}>备注</th>
            <th style={{ ...thStyle, borderBottom: "none" }}>足迹</th>
            {/* 进编辑时这里是「保存」按钮，按它的宽度留 */}
            <th style={{ ...thStyle, borderBottom: "none", width: 52 }}>操作</th>
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
              <select value={season} onChange={(e) => setSeason(e.target.value)} style={filterInputStyle}>
                <option value="">全部</option>
                {seasonOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
                <option value={SEASON_FILTER_NONE}>没下过单</option>
              </select>
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
            {/* 备注不给筛选框：内容太散，真要找人用昵称/足迹更快 */}
            <th style={filterThStyle} />
            <th style={filterThStyle}>
              <input
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
                placeholder="筛选地点、日期或年份，如 locbl / 1/18 / 2025"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle} />
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            if (r.id === editingId) {
              const row = draft?.id === r.id ? { ...r, edit: draft.edit, contactIds: draft.contactIds } : r;
              return <EditRow
                  key={r.id}
                  row={row}
                  error={editError}
                  action={updateAction}
                  onSubmit={(e) => saveEdit(e, r)}
                  onCancel={cancelEdit}
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
                <td style={narrowTdStyle}>
                  {r.name || <span style={{ color: "var(--text-faint)" }}>-</span>}
                  {/* 自己注册时填的称呼：排期总览上显示的是它（称呼优先），这里也得看得到 */}
                  {r.selfName && r.selfName !== r.name && (
                    <span style={{ color: "var(--text-faint)", fontSize: 12 }}> · 称呼 {r.selfName}</span>
                  )}
                </td>
                <td style={narrowTdStyle}>{r.chatId}</td>
                <td style={tdStyle}>
                  <SeasonTags seasons={r.seasons} />
                </td>
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
                  <Link
                    href={`/admin/customers?edit=${r.id}`}
                    scroll={false}
                    onClick={(e) => startEdit(e, r.id)}
                    style={linkButtonStyle}
                  >
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
