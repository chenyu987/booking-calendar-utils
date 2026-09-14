import Link from "next/link";
import { isWeekend, shortLabel, todayIso } from "@/lib/dates";
import {
  PROVIDER_COL_GAP,
  PROVIDER_COL_WIDTH,
  type ProviderBlock,
  type ProviderBoard,
  type ProviderRow,
} from "@/lib/providerBoard";
import { formatHolder } from "@/lib/age";
import { proposeMatch } from "./actions";

const LANE_H = 26;
const HEADER_H = 36;
const LABEL_W = 150;

// 物主主页上的日历：**我的资源 × 日期**。
//
// 跟管理员那张排期总览是两张表，不是同一张开了只读。管理员那张纵轴是全部资源、
// 块上写着客户姓名和金额；这张纵轴只有他自己的资源，块上一个字的客户信息都没有 ——
// 物主看不到客户是谁，跟客户看不到持有人是谁对称。
//
// 能做的事只有一件：点一个需求 → 确认 → 提意向。改不了任何单子。
export default function DemandCalendar({
  board,
  resources,
  card,
  propose,
}: {
  board: ProviderBoard;
  resources: any[];
  /** 收窄到某一个资源，空 = 全部 */
  card: string;
  /** `${orderId}:${resourceId}`，待确认的那一个 */
  propose: string;
}) {
  const byResource = new Map(resources.map((s: any) => [s.id, s]));
  const today = todayIso();
  const totalWidth =
    board.days.length * PROVIDER_COL_WIDTH + Math.max(0, board.days.length - 1) * PROVIDER_COL_GAP;
  const href = (extra: string) => `/provider${card ? `?card=${card}&` : "?"}${extra}`;

  return (
    <>
      {/* 资源选择器只在**有两张以上**的时候出现。只有一个资源的时候，
          一个只有一个选项的下拉纯属噪音，而且「全部」跟「那一张」是同一个画面。 */}
      {resources.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 0" }}>
          <Link href="/provider" style={card ? chipStyle : chipActiveStyle}>
            全部资源
          </Link>
          {resources.map((s: any) => (
            <Link
              key={s.id}
              href={`/provider?card=${s.id}`}
              style={card === s.id ? chipActiveStyle : chipStyle}
            >
              {s.holder_name ?? "?"}
            </Link>
          ))}
        </div>
      )}

      {board.days.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 14 }}>
          {card
            ? "这个资源现在没有能接的需求，也没有排出去的日子。"
            : "现在没有你的资源能接的需求，也没有排出去的日子。过两天再来看看。"}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "12px 0 6px" }}>
            现在有 <b>{board.candidateOrderCount}</b> 单是
            {card ? "这个资源" : "你的资源"}接得了的。
          </p>

          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6 }}>
            {/* 左边资源名那一列不跟着横滚，不然滚两下就不知道哪行是哪个资源 */}
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
              <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border)" }} />
              {board.rows.map((row) => {
                const s: any = byResource.get(row.resourceId);
                return (
                  <div key={row.resourceId} style={{ ...labelCellStyle, height: rowHeight(row) }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s?.holder_name ?? "?"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {formatHolder(s?.holder_gender, s?.holder_date_of_birth)} · {s?.item_type}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ overflowX: "auto", flex: 1 }}>
              <div style={{ width: totalWidth, minWidth: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    gap: PROVIDER_COL_GAP,
                    height: HEADER_H,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {board.days.map((d) => {
                    const { date, weekday } = shortLabel(d);
                    return (
                      <div
                        key={d}
                        style={{
                          width: PROVIDER_COL_WIDTH,
                          flexShrink: 0,
                          textAlign: "center",
                          fontSize: 11,
                          paddingTop: 4,
                          background: isWeekend(d) ? "var(--weekend-bg)" : undefined,
                          color: d === today ? "var(--link)" : "var(--text-muted)",
                          fontWeight: d === today ? 600 : 400,
                        }}
                      >
                        <div>{date}</div>
                        <div style={{ fontSize: 10 }}>{weekday}</div>
                      </div>
                    );
                  })}
                </div>

                {board.rows.map((row) => (
                  <div
                    key={row.resourceId}
                    style={{
                      position: "relative",
                      height: rowHeight(row),
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {/* 周末和今天的竖条铺在最底下 */}
                    {board.days.map((d, i) =>
                      isWeekend(d) || d === today ? (
                        <div
                          key={d}
                          style={{
                            position: "absolute",
                            left: colLeft(i),
                            top: 0,
                            bottom: 0,
                            width: PROVIDER_COL_WIDTH,
                            background: d === today ? "var(--row-tint)" : "var(--weekend-bg)",
                          }}
                        />
                      ) : null
                    )}

                    {row.booked.map((b, i) => (
                      <div key={`b${i}`} style={{ ...blockBase(b, 0), ...bookedStyle }} title={b.title}>
                        {b.label}
                      </div>
                    ))}

                    {row.lanes.map((lane, laneIndex) =>
                      lane.map((b) => {
                        const style = {
                          ...blockBase(b, laneIndex + 1),
                          ...(b.proposed ? proposedStyle : candidateStyle),
                          ...(propose === `${b.orderId}:${row.resourceId}`
                            ? { outline: "2px solid var(--link)", outlineOffset: 1 }
                            : null),
                        };
                        // 已经提过的不再是个链接 —— 点了也没用，别让人白点
                        return b.proposed ? (
                          <div key={`${b.orderId}-${b.startIndex}`} style={style} title={b.title}>
                            已提 · {b.label}
                          </div>
                        ) : (
                          <Link
                            key={`${b.orderId}-${b.startIndex}`}
                            href={href(`propose=${b.orderId}:${row.resourceId}`)}
                            style={{ ...style, textDecoration: "none" }}
                            title={b.title}
                          >
                            {b.label}
                          </Link>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 日历回答「我的资源什么时候空着」，这条清单回答「现在有哪些能接」。
              手机上一屏只看得到五六天，光靠日历的话一个月后那单得横着滚半天。 */}
          {board.candidates.length > 0 && (
            <ul style={listStyle}>
              {board.candidates.map((c) => (
                <li key={`${c.orderId}:${c.resourceId}`} style={listItemStyle}>
                  <span style={{ fontSize: 13 }}>
                    {c.title}
                    {/* 「全部资源」视角下要说清楚是哪个资源接 —— 两个资源都能接同一单是常事 */}
                    {!card && resources.length > 1 && (
                      <span style={{ color: "var(--text-faint)" }}>
                        {" "}
                        · 用 {byResource.get(c.resourceId)?.holder_name ?? "?"}
                      </span>
                    )}
                  </span>
                  {c.proposed ? (
                    <span style={{ fontSize: 12, color: "var(--st-pickup-text)", flexShrink: 0 }}>
                      已提意向
                    </span>
                  ) : (
                    <Link
                      href={href(`propose=${c.orderId}:${c.resourceId}`)}
                      style={{ fontSize: 13, color: "var(--link)", flexShrink: 0 }}
                    >
                      我可以接 →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// 待确认的那一步：点色块先跳到 ?propose=<order>:<resource>，弹一条确认再提交。
// 不是多此一举 —— 日历上点一下太轻了，而「提意向」是要发给管理员的东西，
// 手滑提一堆出去，匹配台那边得一条条清。
export function ProposeConfirm({
  block,
  resourceName,
  orderId,
  resourceId,
  card,
}: {
  block: ProviderBlock;
  resourceName: string;
  orderId: string;
  resourceId: string;
  card: string;
}) {
  return (
    <form action={proposeMatch} style={confirmBarStyle}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="resource_id" value={resourceId} />
      <input type="hidden" name="card" value={card} />
      <span style={{ fontSize: 13 }}>
        拿 <b>{resourceName}</b> 接 <b>{block.title}</b>？
      </span>
      <button type="submit" style={confirmButtonStyle}>
        确认提意向
      </button>
      <Link href={card ? `/provider?card=${card}` : "/provider"} style={cancelStyle}>
        取消
      </Link>
    </form>
  );
}

function rowHeight(row: Pick<ProviderRow, "lanes">): number {
  // 一条给已排，剩下的给候选。一条都没有也留一条的高度，不然行会瘪成一条线
  return (1 + Math.max(1, row.lanes.length)) * LANE_H + 6;
}

function colLeft(index: number): number {
  return index * (PROVIDER_COL_WIDTH + PROVIDER_COL_GAP);
}

function blockBase(b: ProviderBlock, lane: number): React.CSSProperties {
  return {
    position: "absolute",
    left: colLeft(b.startIndex),
    top: lane * LANE_H + 3,
    width: b.length * PROVIDER_COL_WIDTH + (b.length - 1) * PROVIDER_COL_GAP,
    height: LANE_H - 4,
    borderRadius: 3,
    fontSize: 11,
    lineHeight: `${LANE_H - 6}px`,
    padding: "0 5px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
}

const bookedStyle: React.CSSProperties = {
  background: "var(--st-assigned-bg)",
  border: "1px solid var(--st-assigned-border)",
  color: "var(--st-assigned-text)",
};
const candidateStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px dashed var(--border-strong)",
  color: "var(--link)",
  cursor: "pointer",
};
const proposedStyle: React.CSSProperties = {
  background: "var(--st-pickup-bg)",
  border: "1px solid var(--st-pickup-border)",
  color: "var(--st-pickup-text)",
};
const labelCellStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  boxSizing: "border-box",
  overflow: "hidden",
};
const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "12px 0 0",
  border: "1px solid var(--border)",
  borderRadius: 6,
};
const listItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "9px 12px",
  borderBottom: "1px solid var(--border)",
};
const chipStyle: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  fontSize: 12,
  color: "var(--text-muted)",
  textDecoration: "none",
};
const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderColor: "var(--solid-bg)",
};
const confirmBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
  padding: "10px 12px",
  border: "1px solid var(--notice-border)",
  background: "var(--notice-bg)",
  borderRadius: 6,
};
const confirmButtonStyle: React.CSSProperties = {
  padding: "7px 14px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const cancelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  textDecoration: "none",
};
