"use client";

import Link from "next/link";
import BoardDayHeader from "@/components/BoardDayHeader";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { BAND_GAP, EXTRA_LANES } from "@/lib/bandDays";
import {
  padDaysToFullBands,
  splitBoardIntoBands,
} from "@/lib/providerBoard";
import { SKIP_LABELS } from "@/lib/referral";
import {
  REFERRAL_COL_GAP,
  REFERRAL_COL_WIDTH,
  type ReferralBoard,
  type ReferralBlock,
} from "@/lib/referralBoard";

/** 块是两行的，行高跟排期总览同一个数 */
const LANE_H = 42;

// 登记面板占的格子。
// 格子是拿来**定位**的，面板自己贴内容宽（width: fit-content），所以这两个数
// 是上界不是尺寸：
// **宽**：最长的是第一行那句话，实测约 360px。9 列 × 最窄 56 = 504，三成余量；
//   真挤不下时表单会换行（flexWrap），不会横着顶出去。
//   span 小一点还有个好处：贴着右边的块不用被clamp 往左拽太多。
// **高**：面板实测 86px，2 行的格子实测 136px。
const PANEL_COLS = 9;
// 跟 EXTRA_LANES 相等**不是巧合**：面板就是落进带子底下本来就空着的那两条泳道，
// 所以开合不改变高度。改其中一个就得改另一个，别让它们分家
const PANEL_ROWS = EXTRA_LANES;

// 返点的日历视图：**跟排期总览 / 匹配台那两张一个长相**。
// 色块横跨需求日、颜色跟订单状态走、互不冲突的挤一条道、排不下的日子换到下一带 ——
// 全是那一套，几何常量也全部从 lib/providerBoard.ts 和 lib/bandDays.ts 取，
// 这儿一个像素都不自己算。
//
// 区别在块上写什么：那两张写的是「谁的单、分配进度」，这张写的是
// **这一单该给谁返多少、付了没有**。
export default function ReferralCalendar({
  board,
  bandDays,
  today,
  panels,
}: {
  board: ReferralBoard;
  bandDays: number;
  /** 「今天是哪天」必须服务端传下来，客户端自己算会在跨日那几小时对不上 */
  today: string;
  /**
   * 每个块的登记面板，按 `订单::介绍人` 索引。**每一块都渲染出来**，
   * 默认被 CSS 藏着，点哪个显哪个 —— 切换是纯 CSS，不回服务端。
   *
   * 这里面是**服务端渲染好的**节点（表单挂着 Server Action），
   * 当 props 传进客户端组件是允许的；传函数就不行了，所以是一张表不是回调。
   */
  panels: Record<string, React.ReactNode>;
}) {
  if (board.days.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 14 }}>
        还没有能画的返点。先建一条介绍关系，被介绍人下过单就会出现在这儿。
      </p>
    );
  }

  const days = padDaysToFullBands(board.days, bandDays);
  const bands = splitBoardIntoBands<
    ReferralBlock,
    { booked: ReferralBlock[]; lanes: ReferralBlock[][] }
  >({ days, rows: [{ booked: [], lanes: board.lanes }] }, bandDays);

  // 跨带的块两条带上都画，面板只挂第一条 —— 不然同一个 key 有两张面板会一起显出来
  const panelDone = new Set<string>();

  const perBand = Math.min(bandDays, Math.max(1, days.length));
  const columns = `repeat(${perBand}, minmax(${REFERRAL_COL_WIDTH}px, 1fr))`;
  const minWidth = perBand * REFERRAL_COL_WIDTH + Math.max(0, perBand - 1) * REFERRAL_COL_GAP;

  return (
    <>
      {/* 图例跟另外两张日历一个含义，省得每页各记一套 */}
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

      {/* **一个大表**：一层外框、一条横向滚动，带子在里面接着往下排 */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
        <div style={{ minWidth }}>
          {bands.map((band, i) => {
            const lanes = band.rows[0].lanes;
            const last = i === bands.length - 1;

            // 这一带里每个块各挂一张面板（第一次出现时才挂）。
            // 面板排在这一带**所有泳道之下**，横向对齐它自己那个块 ——
            // 不塞在紧挨着的下一行：那儿可能已经有别的泳道的块，会撞上。
            // 它们都落在同一批格子里、互相重叠，但同一时刻只有一张是 display:block
            const panelSpan = Math.min(PANEL_COLS, perBand);
            const bandPanels = lanes.flat().filter((b) => {
              const k = `${b.orderId}::${b.referrerId}`;
              if (panelDone.has(k)) return false;
              panelDone.add(k);
              return true;
            });

            return (
              <div key={band.days[0] ?? i} style={{ marginBottom: last ? 0 : BAND_GAP }}>
                <BoardDayHeader days={band.days} today={today} columns={columns} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: columns,
                    gap: REFERRAL_COL_GAP,
                    gridAutoRows: `${LANE_H}px`,
                    paddingBottom: last ? 6 : 0,
                  }}
                >
                  {lanes.map((lane, laneIndex) =>
                    lane.map((b) => {
                      const c = statusColor(b.status);
                      const key = `${b.orderId}::${b.referrerId}`;
                      return (
                        // 点一个块 = 打开它的登记面板（在日历底下）。
                        // 状态走 URL 参数，不用 useState —— 这一页全是 Server Component
                        <Link
                          key={`${b.orderId}-${b.referrerId}-${b.startIndex}`}
                          href={`/admin/referrals?pay=${encodeURIComponent(key)}`}
                          data-pay-key={key}
                          title={b.title}
                          style={{
                            textDecoration: "none",
                            ...blockBase,
                            gridColumn: `${b.startIndex + 1} / span ${b.length}`,
                            gridRow: laneIndex + 1,
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            color: c.text,
                            // 不产生返点的：斜纹压一层 + 压暗，一眼能跟真的返点分开，
                            // 但**不隐藏** —— 已经付过钱的那种必须看得见
                            ...(b.counts
                              ? null
                              : {
                                  opacity: 0.55,
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, transparent 0 5px, var(--border) 5px 6px)",
                                }),
                            // 已付的块左边压一道绿边：颜色之外再给一条线索，
                            // 块底色是跟着订单状态走的，光靠文字颜色区分度不够
                            ...(b.counts && b.paid > 0
                              ? { borderLeft: "3px solid var(--ok)" }
                              : null),
                            // 选中的光圈由 ReferralUI 注入的一条 CSS 规则画
                            // （outline + offset 1，跟排期总览/匹配台同一套；
                            // 不改块本身的边框 —— 改了几何就跟没选中的错开了）
                          }}
                        >
                          {/* 两行，跟另外两张日历一个排法。右边那组靠一个 flex:1 的
                              空 span 顶过去（「弹簧」），别用 gap 去凑 */}
                          <div style={blockLineStyle}>
                            <span style={ellipsisStyle}>{b.referee}</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ opacity: 0.8, flexShrink: 0 }}>{b.location}</span>
                          </div>
                          <div style={blockLineStyle}>
                            <span style={{ flexShrink: 0, opacity: 0.85 }}>→ {b.referrer}</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ flexShrink: 0, fontWeight: 500 }}>
                              {b.counts ? (
                                b.paid > 0 ? (
                                  // 已付：打勾 + 绿色，不加粗 —— 这笔结清了，不用再看
                                  <span style={{ color: "var(--ok)" }}>
                                    ✓ ${b.paid.toLocaleString()}
                                  </span>
                                ) : (
                                  // 待付：加粗 + 警示色 —— 这才是还要掏钱的
                                  <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                                    ${b.rebate.toLocaleString()}
                                  </span>
                                )
                              ) : (
                                SKIP_LABELS[b.skipReason ?? "status"]
                              )}
                            </span>
                          </div>
                        </Link>
                      );
                    })
                  )}

                  {bandPanels.map((b) => {
                    const key = `${b.orderId}::${b.referrerId}`;
                    // 右边放不下就往左挪，别顶出格子
                    const start = Math.max(0, Math.min(b.startIndex, perBand - panelSpan));
                    return (
                      <div
                        key={`panel-${key}`}
                        data-ref-panel={key}
                        style={{
                          gridColumn: `${start + 1} / span ${panelSpan}`,
                          gridRow: `${lanes.length + 1} / span ${PANEL_ROWS}`,
                          // **资源绝对定位，格子里不留任何在流内的内容。**
                          // 不这么做的话，资源的 min-content 宽度会被 grid 摊到它跨的
                          // 那几列上，`minmax(56px, 1fr)` 于是把整张表的列一起撑宽 ——
                          // 一点开块就变大了，进出选中态几何对不上（CLAUDE.md 里
                          // 反复出问题的那一类）。行高靠显式的 gridRow 撑，不靠内容
                          position: "relative",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ position: "absolute", top: 0, left: 0 }}>
                          {panels[key] ?? null}
                        </div>
                      </div>
                    );
                  })}

                  {/* 带子底下空两条泳道，跟另外两张同一份数字。
                      **最后一带也要留**（另外两张日历是 `!last` 就不留的）——
                      登记面板正好占这两行（PANEL_ROWS === EXTRA_LANES），
                      不留的话在最后一带展开面板会把整个框撑高，右边那根拖拽条
                      跟着忽长忽短。留上之后面板落进本来就空着的地方，
                      **开合高度一模一样**，也不多占一个像素 */}
                  <div
                    style={{
                      gridRow: Math.max(1, lanes.length) + EXTRA_LANES,
                      gridColumn: 1,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// 块长什么样。**位置交给 grid**，这儿一个像素都不算。
// 数值跟 MatchCalendar 的 blockBase 逐项对齐 —— 三张日历看着必须是同一张表
const blockBase: React.CSSProperties = {
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
