import Link from "next/link";
import { isWeekend, shortLabel, todayIso } from "@/lib/dates";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { BAND_GAP, EXTRA_LANES } from "@/lib/bandDays";
import { PROVIDER_COL_GAP, PROVIDER_COL_WIDTH, splitBoardIntoBands } from "@/lib/providerBoard";
import type { MatchBoard, OrderBlock } from "@/lib/matchBoard";

/** 块是两行的，行高跟排期总览同一个数 */
const LANE_H = 42;
const HEADER_H = 36;

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
  // 订单日历只有一组泳道（不像物主那张每个资源一行），所以包成一个「行」丢进去
  const bands = splitBoardIntoBands<OrderBlock, { booked: OrderBlock[]; lanes: OrderBlock[][] }>(
    { days: board.days, rows: [{ booked: [], lanes: board.lanes }] },
    bandDays
  );
  // 整张表按**满一带**的宽度来，最后一条带子短一点也不让整张表跟着缩
  const fullWidth =
    Math.min(bandDays, board.days.length) * PROVIDER_COL_WIDTH +
    Math.max(0, Math.min(bandDays, board.days.length) - 1) * PROVIDER_COL_GAP;

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
        <div style={{ width: fullWidth, minWidth: "100%" }}>
        {bands.map((band, i) => {
          const lanes = band.rows[0].lanes;
          const last = i === bands.length - 1;
          return (
            <div
              key={band.days[0] ?? i}
              style={{ marginBottom: last ? 0 : BAND_GAP }}
            >
              <div>
                {/* 周末和今天的标注**照搬排期总览**：橙色底和那条粗下边线都只画在
                    日期格上，不往下带。总览那边整列贯通的竖条是留给 peak date 的
                    （限制资源进不了场，比「今天是周几」要紧得多）；周末拿它一画，
                    泳道里就多出几条跟订单无关的竖条，反倒盖过色块本身 */}
                <div style={{ display: "flex", gap: PROVIDER_COL_GAP, height: HEADER_H }}>
                  {band.days.map((d) => {
                    const { date, weekday } = shortLabel(d);
                    const weekend = isWeekend(d);
                    return (
                      <div
                        key={d}
                        data-today={d === today ? "1" : undefined}
                        style={{
                          width: PROVIDER_COL_WIDTH,
                          flexShrink: 0,
                          boxSizing: "border-box",
                          textAlign: "center",
                          fontSize: 11,
                          paddingTop: 4,
                          background: weekend ? "var(--weekend-bg)" : "var(--surface-2)",
                          borderBottom:
                            d === today ? "2px solid var(--text)" : "1px solid var(--border)",
                          color: weekend ? "var(--warn)" : "var(--text-muted)",
                          fontWeight: d === today ? 600 : 400,
                        }}
                      >
                        <div>{date}</div>
                        <div style={{ fontSize: 10 }}>{weekday}</div>
                      </div>
                    );
                  })}
                </div>

                {/* 带子底下空两条泳道再加 BAND_GAP —— 跟排期总览同一份数字，
                    效果就是「最后一个单子离下一层日历有两个单子那么远」。
                    最后一带不用留：下面没有东西接着了 */}
                <div
                  style={{
                    position: "relative",
                    height:
                      (Math.max(1, lanes.length) + (last ? 0 : EXTRA_LANES)) * LANE_H +
                      (last ? 6 : 0),
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
                            ...blockBase(b, laneIndex),
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

function colLeft(index: number): number {
  return index * (PROVIDER_COL_WIDTH + PROVIDER_COL_GAP);
}

function blockBase(b: OrderBlock, lane: number): React.CSSProperties {
  return {
    position: "absolute",
    left: colLeft(b.startIndex),
    top: lane * LANE_H + 3,
    width: b.length * PROVIDER_COL_WIDTH + (b.length - 1) * PROVIDER_COL_GAP,
    height: LANE_H - 6,
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
}

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
