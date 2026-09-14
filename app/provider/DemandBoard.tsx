import Link from "next/link";
import { isWeekend, shortLabel, todayIso } from "@/lib/dates";
import {
  PROVIDER_BAND_DAYS_MAX,
  PROVIDER_BAND_DAYS_MIN,
  PROVIDER_COL_GAP,
  PROVIDER_COL_WIDTH,
  splitBoardIntoBands,
  type ProviderBand,
  type ProviderBlock,
  type ProviderBoard,
  type ProviderRow,
} from "@/lib/providerBoard";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import { saveViewSettings } from "./actions";
import { formatHolder } from "@/lib/age";
import { proposeMatch } from "./actions";

const LANE_H = 26;
const HEADER_H = 36;
const LABEL_W = 150;

// 物主主页上的需求视图。**同一批数据两种看法，一次只显示一种**：
//
//   · 日历 —— 我的资源 × 日期。回答「我的资源什么时候空着，哪几单正好落在空档里」
//   · 列表 —— 一行一单。回答「现在有哪些能接」，手机上不用横着滚
//
// 原来两个是上下摞着的，等于每次都把两份同样的东西看两遍。切换存在 URL 的
// `?view=` 上（跟 `?card=` 一个路子）：能收藏、刷新不丢、不用客户端状态。
//
// 跟管理员那张排期总览是两张表，不是同一张开了只读。管理员那张纵轴是全部资源、
// 块上写着客户姓名和金额；这张纵轴只有他自己的资源，块上一个字的客户信息都没有 ——
// 物主看不到客户是谁，跟客户看不到持有人是谁对称。
//
// 能做的事只有一件：点一个需求 → 确认 → 提意向。改不了任何单子。
export type DemandView = "calendar" | "list";

export function parseView(value: string | undefined): DemandView {
  return value === "list" ? "list" : "calendar";
}

export default function DemandBoard({
  board,
  resources,
  card,
  view,
  propose,
  bandDays,
  start,
  region,
  mtn,
}: {
  board: ProviderBoard;
  resources: any[];
  /** 收窄到某一个资源，空 = 全部 */
  card: string;
  view: DemandView;
  /** `${orderId}:${resourceId}`，待确认的那一个 */
  propose: string;
  /** 每行排几天 */
  bandDays: number;
  /** 指定的起始日，空 = 默认 */
  start: string;
  region: string;
  mtn: string;
}) {
  const byResource = new Map(resources.map((s: any) => [s.id, s]));
  const today = todayIso();
  const bands = splitBoardIntoBands(board, bandDays);

  // 切视图、换资源、点需求都从这儿出链接 —— 保证另外那两个参数不会被踢掉
  const href = (extra?: Record<string, string>) => {
    const q = new URLSearchParams();
    if (card) q.set("card", card);
    if (view === "list") q.set("view", view);
    if (region) q.set("region", region);
    if (mtn) q.set("mtn", mtn);
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return s ? `/provider?${s}` : "/provider";
  };

  return (
    <>
      {/* 资源选择器只在**有两张以上**的时候出现。只有一个资源的时候，
          一个只有一个选项的下拉纯属噪音，而且「全部」跟「那一张」是同一个画面。 */}
      {resources.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 0" }}>
          <Link href={href({ card: "" })} style={card ? chipStyle : chipActiveStyle}>
            全部资源
          </Link>
          {resources.map((s: any) => (
            <Link
              key={s.id}
              href={href({ card: s.id })}
              style={card === s.id ? chipActiveStyle : chipStyle}
            >
              {s.holder_name ?? "?"}
            </Link>
          ))}
        </div>
      )}

      {/* 按地点 / 区域筛。GET 表单原生提交，不用客户端状态 —— 跟 admin 那排筛选
          同一个路子，判断也共用 lib/locations.ts 的 matchesLocationFilter。
          card / view 用 hidden 带着走，筛一下不会把资源和视图踢回默认。 */}
      <form method="get" action="/provider" style={filterRowStyle}>
        {card && <input type="hidden" name="card" value={card} />}
        {view === "list" && <input type="hidden" name="view" value="list" />}
        {/* key 不能省：defaultValue 只在挂载时读一次，URL 变了而 DOM 节点被复用的话
            下拉会一直显示旧值，看着像「筛选开着但没生效」。admin 那边记的是同一个坑 */}
        <select key={`region-${region}`} name="region" defaultValue={region} style={selectStyle}>
          <option value="">全部区域</option>
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <option key={r} value={r}>
              {REGION_LABELS[r]}
            </option>
          ))}
        </select>
        <select key={`mtn-${mtn}`} name="mtn" defaultValue={mtn} style={selectStyle}>
          <option value="">全部地点</option>
          {LOCATION_OPTIONS.filter((m) => !region || m.region === region).map((m) => (
            <option key={m.value} value={m.value} title={m.hint}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="submit" style={smallButtonStyle}>
          筛选
        </button>
        {(region || mtn) && (
          <Link href={href({ region: "", mtn: "" })} style={clearStyle}>
            清掉
          </Link>
        )}
      </form>

      {/* 日历怎么排。只有日历视图用得上，列表视图不显示 —— 摆着只会让人琢磨它管什么 */}
      {view === "calendar" && (
        <details className="disc" style={settingsBoxStyle}>
          <summary style={{ fontSize: 12, color: "var(--text-faint)", cursor: "pointer" }}>
            显示设置
          </summary>
          <form action={saveViewSettings} style={settingsFormStyle}>
            {card && <input type="hidden" name="card" value={card} />}
            <input type="hidden" name="view" value={view} />
            <label style={settingLabelStyle}>
              从哪天开始
              <input type="date" name="start" defaultValue={start} style={settingInputStyle} />
            </label>
            <label style={settingLabelStyle}>
              每行几天
              <input
                type="number"
                name="band_days"
                min={PROVIDER_BAND_DAYS_MIN}
                max={PROVIDER_BAND_DAYS_MAX}
                defaultValue={bandDays}
                style={settingInputStyle}
              />
            </label>
            <button type="submit" style={smallButtonStyle}>
              保存
            </button>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              起始日留空 = 回到默认。排不下的日子换到下一行，不会横着滚出去。
            </span>
          </form>
        </details>
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
          <div style={toggleRowStyle}>
            <Link href={href({ view: "" })} style={view === "calendar" ? segActiveStyle : segStyle}>
              日历
            </Link>
            <Link href={href({ view: "list" })} style={view === "list" ? segActiveStyle : segStyle}>
              列表
            </Link>
          </div>

          {view === "calendar" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {collapseEmptyBands(bands).map((item, i) =>
                item.kind === "band" ? (
                  <Band
                    key={item.band.days[0] ?? i}
                    band={item.band}
                    byResource={byResource}
                    today={today}
                    card={card}
                    propose={propose}
                    href={href}
                  />
                ) : (
                  <div key={`gap-${item.from}`} style={gapStyle}>
                    {shortLabel(item.from).date} – {shortLabel(item.to).date} 没有安排，也没有能接的需求
                  </div>
                )
              )}
            </div>
          )}
          {view === "list" && board.candidates.length === 0 && (
            <p style={{ color: "var(--text-faint)", fontSize: 13, margin: "10px 0 0" }}>
              现在没有能接的需求。日历那边能看到你的资源哪几天已经排出去了。
            </p>
          )}

          {view === "list" && board.candidates.length > 0 && (
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
                      href={href({ propose: `${c.orderId}:${c.resourceId}` })}
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
  view,
}: {
  block: ProviderBlock;
  resourceName: string;
  orderId: string;
  resourceId: string;
  card: string;
  view: DemandView;
}) {
  const back = new URLSearchParams();
  if (card) back.set("card", card);
  if (view === "list") back.set("view", view);
  const backHref = back.toString() ? `/provider?${back}` : "/provider";
  return (
    <form action={proposeMatch} style={confirmBarStyle}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="resource_id" value={resourceId} />
      <input type="hidden" name="card" value={card} />
      <input type="hidden" name="view" value={view} />
      <span style={{ fontSize: 13 }}>
        拿 <b>{resourceName}</b> 接 <b>{block.title}</b>？
      </span>
      <button type="submit" style={confirmButtonStyle}>
        确认提意向
      </button>
      <Link href={backHref} style={cancelStyle}>
        取消
      </Link>
    </form>
  );
}


/**
 * 空掉的行合并成一条。
 *
 * 分带之后中间常常连着好几行什么都没有（这个资源 10 月整月没活儿），每行都摊一张
 * 空网格的话，真有东西的那两行反而被埋了。合成一句「10/13 – 11/9 没有安排」，
 * 时间轴还是连续的 —— 直接跳过的话会变成「10 月哪儿去了」。
 */
function collapseEmptyBands(
  bands: ProviderBand[]
): ({ kind: "band"; band: ProviderBand } | { kind: "gap"; from: string; to: string })[] {
  const isEmpty = (b: ProviderBand) =>
    b.rows.every((r) => r.booked.length === 0 && r.lanes.every((l) => l.length === 0));

  const out: ({ kind: "band"; band: ProviderBand } | { kind: "gap"; from: string; to: string })[] = [];
  for (const band of bands) {
    if (!isEmpty(band)) {
      out.push({ kind: "band", band });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === "gap") last.to = band.days[band.days.length - 1];
    else out.push({ kind: "gap", from: band.days[0], to: band.days[band.days.length - 1] });
  }
  return out;
}

// 一行 n 天。排不下的日子换到下一行 —— 跟 admin 排期总览一个道理，
// 横着滚出去的日子等于看不见。
function Band({
  band,
  byResource,
  today,
  card,
  propose,
  href,
}: {
  band: ProviderBand;
  byResource: Map<string, any>;
  today: string;
  card: string;
  propose: string;
  href: (extra?: Record<string, string>) => string;
}) {
  const totalWidth =
    band.days.length * PROVIDER_COL_WIDTH + Math.max(0, band.days.length - 1) * PROVIDER_COL_GAP;

  return (
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6 }}>
            {/* 左边资源名那一列不跟着横滚，不然滚两下就不知道哪行是哪个资源 */}
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
              <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border)" }} />
              {band.rows.map((row) => {
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
                  {band.days.map((d) => {
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

                {band.rows.map((row) => (
                  <div
                    key={row.resourceId}
                    style={{
                      position: "relative",
                      height: rowHeight(row),
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {/* 周末和今天的竖条铺在最底下 */}
                    {band.days.map((d, i) =>
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
                            href={href({ propose: `${b.orderId}:${row.resourceId}` })}
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
const gapStyle: React.CSSProperties = {
  border: "1px dashed var(--border)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 12,
  color: "var(--text-faint)",
};
const filterRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
  margin: "10px 0 0",
};
const selectStyle: React.CSSProperties = {
  padding: "4px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 12,
  maxWidth: 150,
};
const smallButtonStyle: React.CSSProperties = {
  padding: "5px 12px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
};
const clearStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  textDecoration: "none",
};
const settingsBoxStyle: React.CSSProperties = {
  marginTop: 8,
};
const settingsFormStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-end",
  flexWrap: "wrap",
  padding: "8px 0 0",
};
const settingLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 11,
  color: "var(--text-muted)",
};
const settingInputStyle: React.CSSProperties = {
  padding: "4px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 12,
  width: 130,
};
const toggleRowStyle: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  overflow: "hidden",
  margin: "0 0 8px",
};
const segStyle: React.CSSProperties = {
  padding: "5px 14px",
  fontSize: 12,
  color: "var(--text-muted)",
  textDecoration: "none",
};
const segActiveStyle: React.CSSProperties = {
  ...segStyle,
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
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
