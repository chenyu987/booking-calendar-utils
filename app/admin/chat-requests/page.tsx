import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DISPLAY_COLUMNS, displayName } from "@/lib/person";
import { DATE_INPUT_MAX } from "@/lib/dates";
import {
  GROUP_NAME_MAX,
  GROUP_NOTE_MAX,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  formatRequestDates,
  formatRequestParty,
  keepRequest,
  matchRequestPerson,
  parseRequestFilters,
  requestFiltersQuery,
  estimateTotal,
  inferSentTime,
  requestItem,
  sentOffsetMinutes,
  sortRequests,
  type RequestSort,
  type RequestStatus,
} from "@/lib/chatRequests";
import {
  buttonStyle,
  dangerLinkStyle,
  helpTextStyle,
  inputStyle,
  pageTitleStyle,
  segActiveStyle,
  segStyle,
  selectStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "@/lib/adminStyles";
import LocalTime from "../history/LocalTime";
import FilterForm from "../orders/FilterForm";
import { getRequestPrices } from "@/lib/appSettings";
import { bulkUpdateRequests, createGroup, deleteGroup, saveRequestPrices, updateGroup, updateRequest } from "./actions";
import { BULK_FORM, BulkControls, SelectAll } from "./BulkSelect";
import ConfirmSubmit from "./ConfirmSubmit";

export const dynamic = "force-dynamic";

// 拉最近 FETCH_LIMIT 条，筛选在内存里做（lib/chatRequests.ts 的 keepRequest，为什么见那儿）。
// 显示最多 PAGE_SIZE 条。
const FETCH_LIMIT = 2000;
const PAGE_SIZE = 300;

const GROUP_ERRORS: Record<string, string> = {
  empty: "群名没填",
  dup: "已经有这个群了（不分大小写、不管空格）",
  long: `群名太长了（最多 ${GROUP_NAME_MAX} 个字）`,
};

export default async function ChatRequestsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const filters = parseRequestFilters(searchParams);
  const backQs = requestFiltersQuery(filters);

  const [{ data: rows, error }, { data: groups, error: groupsError }, prices] = await Promise.all([
    supabase
      .from("chat_requests")
      .select(
        "id, group_id, group_name, sender, item_type, location, dates, male, female, quote, sent_at, sent_time, captured_at, created_at, status, admin_note"
      )
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase.from("chat_groups").select("id, name, active, note, created_at").order("created_at"),
    getRequestPrices(),
  ]);
  const groupName = new Map((groups ?? []).map((g: any) => [g.id, g.name as string]));

  const offset = sentOffsetMinutes(rows ?? []);
  const withGuess = (rows ?? []).map((r: any) =>
    r.sent_time ? r : { ...r, sent_guess: inferSentTime(r.sent_at, r.captured_at ?? r.created_at, offset) }
  );

  // 状态以外的条件先筛，顶上标签的数字是「换个状态有几条」
  const matching = withGuess.filter((r: any) => keepRequest(r, filters));
  const count = (s: RequestStatus | "all") => (s === "all" ? matching.length : matching.filter((r: any) => r.status === s).length);
  // 估总价现算（lib/chatRequests.ts 的 estimateTotal），排序和显示用同一份
  const estimates = new Map(matching.map((r: any) => [r.id, estimateTotal(r, prices)]));
  const shown = sortRequests(
    matching.filter((r: any) => filters.status === "all" || r.status === filters.status),
    filters,
    (r: any) => estimates.get(r.id)?.total ?? null
  ).slice(0, PAGE_SIZE);

  // 表头点一下按它排，再点一下反过来。当前排序的那一列带箭头
  const sortHeader = (key: RequestSort, label: string) => {
    const on = filters.sort === key;
    const dir = on && filters.dir === "desc" ? "asc" : "desc";
    return (
      <Link
        href={`/admin/chat-requests${requestFiltersQuery(filters, { sort: key, dir })}`}
        style={{ color: "inherit", textDecoration: "none" }}
        title={on ? (filters.dir === "desc" ? "现在新的在上，点一下反过来" : "现在旧的在上，点一下反过来") : "按这个排"}
      >
        {label} {on ? (filters.dir === "desc" ? "↓" : "↑") : "↕"}
      </Link>
    );
  };

  // 每个群抓到过几条，群管理里显示
  const perGroup = new Map<string, number>();
  for (const r of rows ?? []) if (r.group_id) perGroup.set(r.group_id, (perGroup.get(r.group_id) ?? 0) + 1);

  const senders = [...new Set(shown.map((l: any) => String(l.sender).trim()).filter(Boolean))];
  const people: any[] = [];
  if (senders.length) {
    const [byName, byId] = await Promise.all([
      supabase.from("people").select(`id, ${DISPLAY_COLUMNS}`).in("chat_name", senders),
      supabase.from("people").select(`id, ${DISPLAY_COLUMNS}`).in("chat_id", senders),
    ]);
    const seen = new Set<string>();
    for (const p of [...(byName.data ?? []), ...(byId.data ?? [])]) {
      if (!seen.has(p.id)) people.push(p), seen.add(p.id);
    }
  }

  const tabs: (RequestStatus | "all")[] = [...REQUEST_STATUSES, "all"];
  const activeCount = (groups ?? []).filter((g: any) => g.active).length;
  const filtered = !!(
    filters.group || filters.sender || filters.item || filters.location || filters.day || filters.party || filters.from || filters.to
  );

  return (
    <main>
      <h1 style={pageTitleStyle}>Request 需求</h1>
      <p style={helpTextStyle}>
        Collector 从群聊截图里认出来的求物品消息。模型认的，人名、日期可能有错，加人前看一眼原文。
      </p>

      <div style={{ display: "flex", gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
        {tabs.map((s) => (
          <Link
            key={s}
            href={`/admin/chat-requests${requestFiltersQuery(filters, { status: s })}`}
            style={{ ...(s === filters.status ? segActiveStyle : segStyle), textDecoration: "none" }}
          >
            {s === "all" ? "全部" : REQUEST_STATUS_LABEL[s]} {count(s)}
          </Link>
        ))}
      </div>

      <FilterForm
        action="/admin/chat-requests"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}
      >
        {filters.status !== "new" && <input type="hidden" name="status" value={filters.status} />}
        <select name="group" defaultValue={filters.group} style={selectStyle}>
          <option value="">所有群</option>
          {(groups ?? []).map((g: any) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.active ? "" : "（停抓）"}
            </option>
          ))}
          <option value="none">没挂到群上的</option>
        </select>
        <input name="sender" defaultValue={filters.sender} placeholder="发言人" style={{ ...inputStyle, width: 120 }} />
        <select name="item" defaultValue={filters.item} style={selectStyle}>
          <option value="">所有类型</option>
          <option value="beta">BETA（含按地点推的）</option>
          <option value="alpha">ALPHA（含按地点推的）</option>
        </select>
        <input name="location" defaultValue={filters.location} placeholder="地点（locaj、akaad 都行）" style={{ ...inputStyle, width: 160 }} />
        <span style={helpTextStyle}>活动日</span>
        <input type="date" max={DATE_INPUT_MAX}name="day" defaultValue={filters.day} style={inputStyle} />
        <select name="party" defaultValue={filters.party} style={selectStyle}>
          <option value="">男资源女资源都看</option>
          <option value="male">要男资源的</option>
          <option value="female">要女资源的</option>
          <option value="both">男女都要的</option>
        </select>
        <span style={helpTextStyle}>抓到</span>
        <input type="date" max={DATE_INPUT_MAX}name="from" defaultValue={filters.from} style={inputStyle} />
        <span style={helpTextStyle}>到</span>
        <input type="date" max={DATE_INPUT_MAX}name="to" defaultValue={filters.to} style={inputStyle} />
        {filtered && (
          <Link href={`/admin/chat-requests${requestFiltersQuery(filters, { group: "", sender: "", item: "", location: "", day: "", party: "", from: "", to: "" })}`} style={helpTextStyle}>
            清空筛选
          </Link>
        )}
      </FilterForm>

      {/* 每天单价：估总价用，存在库里（两个管理员看到的一样），不进任何订单 */}
      <form action={saveRequestPrices} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
        <input type="hidden" name="back" value={backQs} />
        <span style={helpTextStyle}>估价用的每天单价：</span>
        <label style={{ fontSize: 14 }}>
          BETA ${" "}
          <input name="price_beta" type="number" min="0" step="1" defaultValue={prices.beta ?? ""} placeholder="不设" style={{ ...inputStyle, width: 80 }} />
        </label>
        <label style={{ fontSize: 14 }}>
          ALPHA ${" "}
          <input name="price_alpha" type="number" min="0" step="1" defaultValue={prices.alpha ?? ""} placeholder="不设" style={{ ...inputStyle, width: 80 }} />
        </label>
        <button type="submit" style={buttonStyle}>
          存单价
        </button>
        <span style={helpTextStyle}>预估 = 单价 × 天数 × 人数；类型、日期、人数有一个没说就不估</span>
      </form>

      <details open={searchParams.groups === "open" || !!searchParams.group_error} style={{ margin: "12px 0" }}>
        <summary style={{ cursor: "pointer", fontSize: 14 }}>
          群名单：{groups?.length ?? 0} 个，在抓 {activeCount} 个
        </summary>
        <p style={helpTextStyle}>
          Collector 每次开始抓的时候按这里「在抓」的群去聊天左栏里找。群名要跟聊天左栏里显示的一字不差；群主改了群名，这里跟着改。
          暂时不想抓就取消「在抓」；删了就从名单里去掉，已经抓到的需求还在，群那一栏显示当时的群名。
        </p>
        {searchParams.group_error && (
          <p style={{ color: "crimson" }}>{GROUP_ERRORS[searchParams.group_error] ?? "没存上，再试一次"}</p>
        )}
        {groupsError && <p style={{ color: "crimson" }}>{groupsError.message}</p>}
        <table style={{ ...tableStyle, marginTop: 8 }}>
          <thead>
            <tr>
              <th style={thStyle}>群名</th>
              <th style={thStyle}>在抓</th>
              <th style={thStyle}>备注</th>
              <th style={thStyle}>抓到过</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((g: any) => (
              <tr key={g.id}>
                <td style={tdStyle} colSpan={5}>
                  <form action={updateGroup} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginRight: 12 }}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="back" value={backQs} />
                    <input name="name" defaultValue={g.name} maxLength={GROUP_NAME_MAX} required style={{ ...inputStyle, width: 260 }} />
                    <label style={{ fontSize: 14 }}>
                      <input type="checkbox" name="active" defaultChecked={g.active} /> 在抓
                    </label>
                    <input name="note" defaultValue={g.note ?? ""} placeholder="备注" maxLength={GROUP_NOTE_MAX} style={{ ...inputStyle, width: 200 }} />
                    <span style={helpTextStyle}>{perGroup.get(g.id) ?? 0} 条</span>
                    <button type="submit" style={buttonStyle}>
                      保存
                    </button>
                  </form>
                  <form action={deleteGroup} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="back" value={backQs} />
                    <ConfirmSubmit
                      message={`删掉「${g.name}」？以后不再抓这个群。已经抓到的 ${perGroup.get(g.id) ?? 0} 条需求留着。`}
                      style={dangerLinkStyle}
                    >
                      删除
                    </ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
            <tr>
              <td style={tdStyle} colSpan={5}>
                <form action={createGroup} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="back" value={backQs} />
                  <input name="name" placeholder="新群名（跟聊天左栏一字不差）" maxLength={GROUP_NAME_MAX} required style={{ ...inputStyle, width: 260 }} />
                  <input name="note" placeholder="备注" maxLength={GROUP_NOTE_MAX} style={{ ...inputStyle, width: 200 }} />
                  <button type="submit" style={buttonStyle}>
                    加群
                  </button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </details>

      {searchParams.error === "bad" && <p style={{ color: "crimson" }}>没存上：状态不对，刷新一下再试</p>}
      {searchParams.error === "none_selected" && <p style={{ color: "crimson" }}>没勾选任何需求</p>}
      {searchParams.bulk && <p style={helpTextStyle}>已批量改了 {Number(searchParams.bulk) || 0} 条。</p>}

      {/* 批量改状态：每行的勾选框用 form 属性挂到这个表单上（表单不能套表单，每行自己有「保存」） */}
      {shown.length > 0 && (
        <form id={BULK_FORM} action={bulkUpdateRequests} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
          <input type="hidden" name="back" value={backQs} />
          <BulkControls
            options={REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABEL[s] }))}
            selectStyle={selectStyle}
            buttonStyle={buttonStyle}
          />
          <span style={helpTextStyle}>按住 Shift 点另一行，中间的一起勾上；表头的勾选框全选这一页</span>
        </form>
      )}
      {error && <p style={{ color: "crimson" }}>{error.message}</p>}
      {shown.length === 0 && <p style={helpTextStyle}>这里没有需求。</p>}
      {matching.length > PAGE_SIZE && <p style={helpTextStyle}>只显示最新 {PAGE_SIZE} 条，用上面的筛选缩小范围。</p>}

      {shown.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>
                <SelectAll />
              </th>
              <th style={thStyle}>{sortHeader("captured", "抓到")}</th>
              <th style={thStyle}>{sortHeader("sent", "群里时间")}</th>
              <th style={thStyle}>群</th>
              <th style={thStyle}>发言人</th>
              <th style={thStyle}>类型</th>
              <th style={thStyle}>地点</th>
              <th style={thStyle}>活动日</th>
              <th style={thStyle}>人数</th>
              <th style={thStyle}>{sortHeader("total", "预估")}</th>
              <th style={thStyle}>原文</th>
              <th style={thStyle}>跟进</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l: any) => {
              const who = matchRequestPerson(l.sender, people);
              const item = requestItem(l.item_type, l.location);
              const nowName = l.group_id ? groupName.get(l.group_id) : null;
              return (
                <tr key={l.id}>
                  <td style={tdStyle}>
                    <input type="checkbox" name="ids" value={l.id} form={BULK_FORM} aria-label="选中这条" />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <LocalTime iso={l.captured_at ?? l.created_at} />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {l.sent_time || l.sent_guess ? <LocalTime iso={l.sent_time ?? l.sent_guess} /> : l.sent_at || "—"}
                    {(l.sent_time || l.sent_guess) && l.sent_at && (
                      <div style={helpTextStyle}>
                        {l.sent_time ? "" : "年份推算的，"}群里写的：{l.sent_at}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {nowName ?? l.group_name}
                    {nowName && nowName !== l.group_name && <div style={helpTextStyle}>当时叫：{l.group_name}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{l.sender}</div>
                    {who && <div style={helpTextStyle}>老客户：{displayName(who)}</div>}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {item.item ? item.item.toUpperCase() : <span style={helpTextStyle}>没说</span>}
                    {item.inferred && <div style={helpTextStyle}>按地点推的</div>}
                    {item.conflict && (
                      <div style={{ color: "crimson", fontSize: 13, whiteSpace: "normal" }}>
                        他说的是 {item.conflict.toUpperCase()}，跟地点对不上，确认一下
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{l.location || <span style={helpTextStyle}>没说</span>}</td>
                  <td style={tdStyle}>{formatRequestDates(l.dates) || <span style={helpTextStyle}>没说</span>}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatRequestParty(l.male, l.female)}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {(() => {
                      const e = estimates.get(l.id);
                      return e ? (
                        <span title={`$${e.price} × ${e.days} 天 × ${e.people} 人`}>
                          ${e.total.toLocaleString()}
                          <div style={helpTextStyle}>
                            {e.days}天×{e.people}人
                          </div>
                        </span>
                      ) : (
                        <span style={helpTextStyle}>—</span>
                      );
                    })()}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 360 }}>{l.quote}</td>
                  <td style={tdStyle}>
                    <form action={updateRequest} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="back" value={backQs} />
                      <select name="status" defaultValue={l.status} style={selectStyle}>
                        {REQUEST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {REQUEST_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" style={buttonStyle}>
                        保存
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
