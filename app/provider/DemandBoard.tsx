import Link from "next/link";
import { shortLabel, todayIso } from "@/lib/dates";
import BoardDayHeader from "@/components/BoardDayHeader";
import {
  PROVIDER_BAND_DAYS_MAX,
  PROVIDER_BAND_DAYS_MIN,
  PROVIDER_COL_GAP,
  PROVIDER_COL_WIDTH,
  providerWindowBounds,
  splitBoardIntoBands,
  type ProviderBand,
  type ProviderBlock,
  type ProviderBoard,
} from "@/lib/providerBoard";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import { saveViewSettings } from "./actions";
import ProposePicker, { ProposeOneCard } from "./ProposePicker";

/** 块是两行的（地点一行、还差几张一行），行高跟另外两张日历同一个数 */
const LANE_H = 42;

// 物主主页上的需求视图。**同一批数据两种看法，一次只显示一种**：
//
//   · 日历 —— 一个块一个单子，跟排期总览和匹配台同一个排法。点一个单子，
//     下面再问「用哪个资源接」。原来是一行一个资源，两个资源就是两张并排的日历，
//     同一单能被两个资源接就画两遍 —— 资源越多越乱，而要看的本来就是「有哪些单」
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
  /** 每行排几天 */
  bandDays: number;
  /** 指定的起始日，空 = 默认 */
  start: string;
  region: string;
  mtn: string;
}) {
  const windowBounds = providerWindowBounds(todayIso());

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
              {/* 上下界跟服务端夹的是同一个范围（lib/providerBoard.ts 的 providerWindowBounds）。
                  这儿给 min/max 只是让日期选择器好用一点 —— 真正拦住的是服务端 */}
              <input
                type="date"
                name="start"
                min={windowBounds.from}
                max={windowBounds.to}
                defaultValue={start}
                style={settingInputStyle}
              />
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
              日历只看今天往前两周、往后四周（{shortLabel(windowBounds.from).date} –{" "}
              {shortLabel(windowBounds.to).date}），起始日也在这个范围里挑，留空 = 回到默认。
              排不下的日子换到下一行，不会横着滚出去。
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

          {view === "calendar" && <BoardCalendar board={board} bandDays={bandDays} />}
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
                        · 用 {resources.find((s: any) => s.id === c.resourceId)?.holder_name ?? "?"}
                      </span>
                    )}
                  </span>
                  {c.proposed ? (
                    <span style={{ fontSize: 12, color: "var(--st-pickup-text)", flexShrink: 0 }}>
                      已提意向
                    </span>
                  ) : (
                    // 确认长在这一行里，提完也不跳转 —— 见 ProposePicker.tsx 开头那段
                    <ProposeOneCard
                      orderId={c.orderId}
                      resourceId={c.resourceId}
                      holderName={
                        resources.find((s: any) => s.id === c.resourceId)?.holder_name ?? "这个资源"
                      }
                    />
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
/**
 * 一张物主日历。**挂了资源的主视图和还没挂资源时的那张预告共用这一个** ——
 * 两边画的是同一种东西（一个块一个单子），差别只在块上有没有「能接的资源」，
 * 那个差别在数据里（fits 空不空），不在渲染里。
 */
export function BoardCalendar({ board, bandDays }: { board: ProviderBoard; bandDays: number }) {
  const today = todayIso();
  // 整张日历只有一组泳道（不像原来每个资源一行），包成一个「行」丢进分带
  const bands = splitBoardIntoBands<ProviderBlock, { booked: ProviderBlock[]; lanes: ProviderBlock[][] }>(
    { days: board.days, rows: [{ booked: [], lanes: board.lanes }] },
    bandDays
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {collapseEmptyBands(bands).map((item, i) =>
        item.kind === "band" ? (
          <Band key={item.band.days[0] ?? i} band={item.band} today={today} />
        ) : (
          <div key={`gap-${item.from}`} style={gapStyle}>
            {shortLabel(item.from).date} – {shortLabel(item.to).date} 没有安排，也没有能接的需求
          </div>
        )
      )}
      {/* 窗口外的单子**不藏着不说**：日历只看四周内，但「还有几单在更远处」
          得让他知道，不然会以为一共就这些 */}
      {board.outsideWindowCount > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
          还有 {board.outsideWindowCount} 单在四周以后，日历上暂时不画 —— 到日子附近了自然会出现。
        </p>
      )}
    </div>
  );
}

function Band({ band, today }: { band: ProviderBand; today: string }) {
  const lanes = band.rows[0].lanes;
  const totalWidth =
    band.days.length * PROVIDER_COL_WIDTH + Math.max(0, band.days.length - 1) * PROVIDER_COL_GAP;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <BoardDayHeader days={band.days} today={today} />

        {/* **底下固定空一格。** 选资源的浮层贴在被点那个块下面，而这块地
            `overflowX: auto` 会把超出去的部分连着竖着一起切掉。空一格是留给它的 ——
            点开之后再临时长高做不到了：开没开是客户端的事，服务端不知道 */}
        <div style={{ position: "relative", height: (Math.max(1, lanes.length) + 1) * LANE_H }}>
          {lanes.map((lane, laneIndex) =>
            lane.map((b) => {
              const base = blockBase(b, laneIndex);
              // 已排是我自己的占用，不是能接的单 —— 点了也没有下一步
              if (b.kind === "booked") {
                return (
                  <div
                    key={`k-${b.startIndex}-${b.gap}`}
                    style={{ ...base, ...bookedStyle }}
                    title={b.title}
                  >
                    <div style={blockLineStyle}>{b.location}</div>
                    <div style={{ ...blockLineStyle, opacity: 0.8 }}>{b.gap}</div>
                  </div>
                );
              }
              // 一张能接的资源都没有（还没挂资源时那张预告），或者能接的都已经提过了 ——
              // 两种都不给点：点进去没有下一步，别让人白点
              if (b.fits.length === 0) {
                return (
                  <div
                    key={`${b.orderId}-${b.startIndex}`}
                    style={{ ...base, ...candidateStyle, cursor: "default" }}
                    title={b.title}
                  >
                    <div style={blockLineStyle}>{b.location}</div>
                    <div style={blockLineStyle}>{b.gap}</div>
                  </div>
                );
              }
              if (b.proposed) {
                return (
                  <div
                    key={`${b.orderId}-${b.startIndex}`}
                    style={{ ...base, ...proposedStyle }}
                    title={b.title}
                  >
                    <div style={blockLineStyle}>{b.location}</div>
                    <div style={blockLineStyle}>已提意向</div>
                  </div>
                );
              }
              // 点开选资源这一步**不走服务端**：/provider 渲染一次 2 秒多，而「看看
              // 哪几个资源能接」根本没有服务端的事要做。见 ProposePicker.tsx
              return (
                <ProposePicker
                  key={`${b.orderId}-${b.startIndex}`}
                  orderId={b.orderId}
                  location={b.location}
                  gap={b.gap}
                  title={b.title}
                  fits={b.fits}
                  blockStyle={{ ...base, ...candidateStyle }}
                  selectedStyle={{ outline: "2px solid var(--link)", outlineOffset: 1 }}
                  popoverTop={(laneIndex + 1) * LANE_H + 1}
                  popoverLeft={colLeft(b.startIndex)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
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
    height: LANE_H - 6,
    borderRadius: 3,
    fontSize: 11,
    lineHeight: 1.4,
    padding: "2px 5px",
    boxSizing: "border-box",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };
}

// 两行都可能比块宽（一天的单子才 56px），各自省略号截断
const blockLineStyle: React.CSSProperties = {
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

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
const confirmButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
};
const cancelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  textDecoration: "none",
};
