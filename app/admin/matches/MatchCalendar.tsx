import Link from "next/link";
import { todayIso } from "@/lib/dates";
import BoardDayHeader from "@/components/BoardDayHeader";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { BAND_GAP, EXTRA_LANES } from "@/lib/bandDays";
import {
  PROVIDER_COL_GAP,
  PROVIDER_COL_WIDTH,
  padDaysToFullBands,
  splitBoardIntoBands,
} from "@/lib/providerBoard";
import type { MatchBoard, OrderBlock } from "@/lib/matchBoard";

/** 块是两行的，行高跟排期总览同一个数 */
const LANE_H = 42;

// 匹配台的日历：**照搬排期总览那张**。一张日历，色块是订单，横轴日期，
// 互不冲突的单子挤在同一条道上，颜色跟着订单状态走 —— 全是总览那一套。
//
// 区别只有一个：总览里点一个单子，左边列的是**全部**资源让你挑；
// 这儿点一个单子，列的是**已经有人主动说想接**的那几张（列表在日历下面）。
export default function MatchCalendar({
  board,
  bandDays,
  assign,
  href,
}: {
  board: MatchBoard;
  bandDays: number;
  /** 正在看哪一单的候选 */
  assign: string;
  href: (extra?: Record<string, string>) => string;
}) {
  const today = todayIso();
  // 最后一带不够一整行就用空日子补齐，右边不留半截
  const days = padDaysToFullBands(board.days, bandDays);
  // 订单日历只有一组泳道（不像物主那张每个资源一行），所以包成一个「行」丢进去
  const bands = splitBoardIntoBands<OrderBlock, { booked: OrderBlock[]; lanes: OrderBlock[][] }>(
    { days, rows: [{ booked: [], lanes: board.lanes }] },
    bandDays
  );
  // **所有带子共用一份列模板**，按满一带的天数算 —— 最后一带短几天就空几列，
  // 整张表不跟着缩。列是弹性的：地方宽就一起撑开填满，窄到 56px 一列放不下时
  // 停在 56，外面那层横着滚
  const perBand = Math.min(bandDays, Math.max(1, days.length));
  const columns = `repeat(${perBand}, minmax(${PROVIDER_COL_WIDTH}px, 1fr))`;
  const minWidth = perBand * PROVIDER_COL_WIDTH + Math.max(0, perBand - 1) * PROVIDER_COL_GAP;

  if (board.days.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 14 }}>
        这些条件下没有意向可画。
      </p>
    );
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px" }}>
        只画有人想接的单子 —— 共 <b>{board.orderCount}</b> 单，其中{" "}
        <b>{board.actionableCount}</b> 条意向现在就能拍板。
        点一个单子，下面会列出谁愿意接它。
      </p>

      {/* **一个大表**：外面只有一层框、一条横向滚动，几条带子在里面接着往下排。
          之前每条带子各自包了一层带边框的盒子，看着就成了两张表。
          排期总览也是分带的（排不下的日子换到下一行），但那边同样只有一层外壳。 */}
      {/* 图例：颜色跟排期总览一个含义，省得两页各记一套 */}
      <div style={legendStyle}>
        {Object.entries(STATUS_LABELS).map(([k, label]) => {
          const c = statusColor(k);
          return (
            <span
              key={k}
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 3,
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.text,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
        <div style={{ minWidth }}>
        {bands.map((band, i) => {
          const lanes = band.rows[0].lanes;
          const last = i === bands.length - 1;
          return (
            <div
              key={band.days[0] ?? i}
              style={{ marginBottom: last ? 0 : BAND_GAP }}
            >
              <div>
                <BoardDayHeader days={band.days} today={today} columns={columns} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: columns,
                    gap: PROVIDER_COL_GAP,
                    gridAutoRows: `${LANE_H}px`,
                    paddingBottom: last ? 6 : 0,
                  }}
                >
                  {lanes.map((lane, laneIndex) =>
                    lane.map((b) => {
                      const c = statusColor(b.status);
                      const selected = assign === b.orderId;
                      return (
                        <Link
                          key={`${b.orderId}-${b.startIndex}`}
                          href={href({ assign: selected ? "" : b.orderId })}
                          title={b.title}
                          style={{
                            ...blockBase,
                            gridColumn: `${b.startIndex + 1} / span ${b.length}`,
                            gridRow: laneIndex + 1,
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            color: c.text,
                            textDecoration: "none",
                            ...(selected
                              ? { outline: "2px solid var(--link)", outlineOffset: 1 }
                              : null),
                          }}
                        >
                          {/* **两行**，跟排期总览的色块一个排法：一行塞不下就只能靠省略号
                              把信息藏起来，而这些正是要拿来做决定的东西。
                              右边那组靠一个 flex:1 的空 span 顶过去（「弹簧」），
                              别用 gap 去凑 —— 凑出来永远差一两像素 */}
                          <div style={blockLineStyle}>
                            <span style={ellipsisStyle}>{b.customer}</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ opacity: 0.8, flexShrink: 0 }}>{b.location}</span>
                          </div>
                          <div style={blockLineStyle}>
                            <span style={{ flexShrink: 0 }}>{b.need}</span>
                            <span style={{ flex: 1 }} />
                            {/* 有几个人想接，是这张日历跟总览的区别所在 */}
                            <span style={{ flexShrink: 0, opacity: 0.85 }}>
                              {b.candidates}人想接
                              {b.actionable > 0 ? ` · ${b.actionable}个能选` : " · 都选不了"}
                            </span>
                          </div>
                        </Link>
                      );
                    })
                  )}

                  {/* 带子底下空两条泳道（跟排期总览同一份数字），效果是「最后一个单子
                      离下一层日历有两个单子那么远」。grid 只给放了东西的行开行，
                      所以拿一个占位的把它们撑出来。最后一带不用留：下面没东西接着了 */}
                  {!last && (
                    <div
                      style={{ gridRow: Math.max(1, lanes.length) + EXTRA_LANES, gridColumn: 1 }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

    </>
  );
}


// 块长什么样。**位置交给 grid**（gridColumn / gridRow），这儿一个像素都不算 ——
// 原来是 `left = 下标 × (列宽 + 间距)`，列宽一变成弹性的就全错位了
const blockBase: React.CSSProperties = {
  // **块填满整行，行与行之间只隔一个 grid gap（2px）** —— 跟排期总览量出来的一样
  // （那边块高 42、间隔 2）。原来块比行矮 6px 再居中，等于每两块之间空 6px，
  // 块少的时候还看得过去，一列堆五六个就散了
  minWidth: 0,
  borderRadius: 3,
  fontSize: 11,
  lineHeight: "1.4",
  padding: "2px 5px",
  boxSizing: "border-box",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  margin: "0 0 8px",
};
const blockLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 4,
  minWidth: 0,
};
const ellipsisStyle: React.CSSProperties = {
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  fontWeight: 500,
};
