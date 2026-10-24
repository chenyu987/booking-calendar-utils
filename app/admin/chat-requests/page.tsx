import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DISPLAY_COLUMNS, displayName } from "@/lib/person";
import {
  REQUEST_NOTE_MAX,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  formatRequestDates,
  formatRequestParty,
  matchRequestPerson,
  parseRequestStatus,
  type RequestStatus,
} from "@/lib/chatRequests";
import {
  buttonStyle,
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
import { updateRequest } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 300;

export default async function ChatRequestsPage(props: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const status: RequestStatus | "all" =
    searchParams.status === "all" ? "all" : parseRequestStatus(searchParams.status) ?? "new";

  let query = supabase
    .from("chat_requests")
    .select(
      "id, group_name, sender, item_type, location, dates, male, female, quote, sent_at, captured_at, created_at, status, admin_note"
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: requests, error }, { data: counts }] = await Promise.all([
    query,
    // 各状态各有几条：只拉 status 一列，在这儿数
    supabase.from("chat_requests").select("status"),
  ]);
  const count = (s: RequestStatus | "all") =>
    s === "all" ? counts?.length ?? 0 : counts?.filter((r: any) => r.status === s).length ?? 0;

  const senders = [...new Set((requests ?? []).map((l: any) => String(l.sender).trim()).filter(Boolean))];
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
            href={`/admin/chat-requests?status=${s}`}
            style={{ ...(s === status ? segActiveStyle : segStyle), textDecoration: "none" }}
          >
            {s === "all" ? "全部" : REQUEST_STATUS_LABEL[s]} {count(s)}
          </Link>
        ))}
      </div>

      {searchParams.error === "bad" && <p style={{ color: "crimson" }}>没存上：状态不对，刷新一下再试</p>}
      {error && <p style={{ color: "crimson" }}>{error.message}</p>}
      {requests?.length === 0 && <p style={helpTextStyle}>这里没有需求。</p>}
      {requests?.length === PAGE_SIZE && <p style={helpTextStyle}>只显示最新 {PAGE_SIZE} 条。</p>}

      {!!requests?.length && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>抓到</th>
              <th style={thStyle}>群 / 发言人</th>
              <th style={thStyle}>要什么</th>
              <th style={thStyle}>原文</th>
              <th style={thStyle}>跟进</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((l: any) => {
              const who = matchRequestPerson(l.sender, people);
              return (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <LocalTime iso={l.captured_at ?? l.created_at} />
                    {l.sent_at && <div style={helpTextStyle}>群里：{l.sent_at}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={helpTextStyle}>{l.group_name}</div>
                    <div style={{ fontWeight: 500 }}>{l.sender}</div>
                    {who && <div style={helpTextStyle}>老客户：{displayName(who)}</div>}
                  </td>
                  <td style={tdStyle}>
                    {l.item_type === "unknown" ? "类型没说" : l.item_type.toUpperCase()} · {l.location || "地点没说"}
                    <div>{formatRequestDates(l.dates) || "日期没说"}</div>
                    <div>{formatRequestParty(l.male, l.female)}</div>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 360 }}>{l.quote}</td>
                  <td style={tdStyle}>
                    <form action={updateRequest} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="back" value={status} />
                      <select name="status" defaultValue={l.status} style={selectStyle}>
                        {REQUEST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {REQUEST_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <input
                        name="admin_note"
                        defaultValue={l.admin_note ?? ""}
                        placeholder="备注"
                        maxLength={REQUEST_NOTE_MAX}
                        style={{ ...inputStyle, width: 140 }}
                      />
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
