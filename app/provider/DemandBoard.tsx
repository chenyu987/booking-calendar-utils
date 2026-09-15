"use client";

import Link from "next/link";
import { useState } from "react";
import { shortLabel } from "@/lib/dates";
import BoardDayHeader from "@/components/BoardDayHeader";
import { BAND_GAP } from "@/lib/bandDays";
import {
  PROVIDER_COL_GAP,
  PROVIDER_COL_WIDTH,
  clampProviderBandDays,
  filterBoardByCard,
  providerWindowBounds,
  padDaysToFullBands,
  splitBoardIntoBands,
  type ProviderBand,
  type ProviderBlock,
  type ProviderBoard,
} from "@/lib/providerBoard";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import type { DemandView } from "@/lib/providerView";
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
// 原来两个是上下摞着的，等于每次都把两份同样的东西看两遍。
//
// **换资源和切视图都在界面上当场完成，不回服务端。** 这两件事原来是 `?card=` /
// `?view=` 两个链接，点一下就是一次整页渲染 —— 这一页要查资源、单、分配、意向，
// 实测 1.5 秒起，而这两个开关**一个新数据都不需要**：服务端算的是「全部资源」那个
// 盘子，收窄到某个资源要的东西盘子里全有（见 lib 的 filterBoardByCard），
// 两个视图画的也是同一批候选。
//
// URL 照样跟着变，用 `history.replaceState` —— 不触发导航，但收藏、刷新、
// 分享链接都还是原来那套（服务端读 searchParams 决定初始值）。
//
// 跟管理员那张排期总览是两张表，不是同一张开了只读。管理员那张纵轴是全部资源、
// 块上写着客户姓名和金额；这张纵轴只有他自己的资源，块上一个字的客户信息都没有 ——
// 物主看不到客户是谁，跟客户看不到持有人是谁对称。
//
// 能做的事只有一件：点一个需求 → 确认 → 提意向。改不了任何单子。
//
// `parseView` / `DemandView` 在 lib/providerView.ts —— 客户端模块导出的函数，
// 服务端 import 到的是个客户端引用，调不了

export default function DemandBoard({
  board: allCards,
  resources,
  today,
  initialCard,
  initialView,
  bandDays,
  initialRegion,
  initialMtn,
}: {
  /** **全部资源**那个盘子。收窄到某一个资源在这儿当场算，不回服务端 */
  board: ProviderBoard;
  resources: any[];
  /** 今天是哪天由服务端给 —— 客户端自己算的话，服务器在 UTC 而浏览器在本地时区，
      两边对不上就是一次 hydration 不匹配 */
  today: string;
  /** 进来时收窄到哪个资源（URL 里的 ?card=），空 = 全部 */
  initialCard: string;
  initialView: DemandView;
  /** 每行排几天（设置收在账号菜单里，见 ViewSettings.tsx） */
  bandDays: number;
  initialRegion: string;
  initialMtn: string;
}) {
  const [card, setCard] = useState(initialCard);
  const [view, setView] = useState<DemandView>(initialView);
  const [region, setRegion] = useState(initialRegion);
  const [mtn, setMtn] = useState(initialMtn);
  const board = filterBoardByCard(allCards, card, { region, mtn });

  // 地址栏跟着变，但**不触发导航**：收藏 / 刷新 / 把链接发给别人都还是原来那套，
  // 代价只是一次 replaceState
  const syncUrl = (next: Partial<{ card: string; view: DemandView; region: string; mtn: string }>) => {
    const s = { card, view, region, mtn, ...next };
    const q = new URLSearchParams();
    if (s.card) q.set("card", s.card);
    if (s.view === "list") q.set("view", "list");
    if (s.region) q.set("region", s.region);
    if (s.mtn) q.set("mtn", s.mtn);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `/provider?${qs}` : "/provider");
  };
  const pickCard = (id: string) => {
    setCard(id);
    syncUrl({ card: id });
  };
  const pickView = (v: DemandView) => {
    setView(v);
    syncUrl({ view: v });
  };
  const pickRegion = (r: string) => {
    // 换了区域，原来选的那个地点多半不在这个区里了 —— 一起清掉，别留一个自相矛盾的组合
    setRegion(r);
    setMtn("");
    syncUrl({ region: r, mtn: "" });
  };
  const pickMtn = (m: string) => {
    setMtn(m);
    syncUrl({ mtn: m });
  };

  return (
    <>
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
          {/* 「接得了」什么意思，就挨着写着它的那句话 —— 原来在整段的最上面，
              离它解释的东西隔着一排芯片和一排筛选。
              三行说明只有第一次有用，之后每次进来都占一屏，所以收起来，要看再点 */}
          <details style={{ margin: "0 0 8px" }}>
            <summary style={{ fontSize: 12, color: "var(--text-faint)", cursor: "pointer" }}>
              怎么算「接得了」？
            </summary>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                margin: "6px 0 0",
                lineHeight: 1.7,
              }}
            >
              一个块是一单。虚线框是你的资源接得了的需求 —— 有效期盖得住、那几天没占着、
              缺的正好是你手上这个资源的性别；蓝色是你已经排出去的日子。
              点一个单子，再挑用哪个资源接，管理员确认之后才算数。
            </p>
          </details>
          {/* 资源选择器只在**有两张以上**的时候出现。只有一个资源的时候，
              一个只有一个选项的下拉纯属噪音，而且「全部」跟「那一张」是同一个画面 */}
          {resources.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 0" }}>
              <button type="button" onClick={() => pickCard("")} style={card ? chipStyle : chipActiveStyle}>
                全部资源
              </button>
              {resources.map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickCard(s.id)}
                  style={card === s.id ? chipActiveStyle : chipStyle}
                >
                  {s.holder_name ?? "?"}
                </button>
              ))}
            </div>
          )}

          {/* 日历/列表 跟 区域/地点 **摆同一行**：都是「我想看哪些、怎么看」，
              一行放得下就别占两行 —— 日历上面每多一行，正事就往下挪一行。
              按地点 / 区域**选了就是筛了，没有「筛选」按钮**：下拉本来就「一选就定」，
              再让人点一下确认是多一步；而且这一下也不回服务端 —— 盘子里每个块身上
              挂着自己是哪个地点（locationKey），当场挑出来就行，判断共用
              lib/locations.ts 的 matchesLocationFilter。
              「清掉」也不用了：选回「全部区域 / 全部地点」就是清掉 */}
          <div style={controlRowStyle}>
            <div style={toggleRowStyle}>
              <button
                type="button"
                onClick={() => pickView("calendar")}
                style={view === "calendar" ? segActiveStyle : segStyle}
              >
                日历
              </button>
              <button
                type="button"
                onClick={() => pickView("list")}
                style={view === "list" ? segActiveStyle : segStyle}
              >
                列表
              </button>
            </div>

            <select value={region} onChange={(e) => pickRegion(e.target.value)} style={selectStyle}>
              <option value="">全部区域</option>
              {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
            <select value={mtn} onChange={(e) => pickMtn(e.target.value)} style={selectStyle}>
              <option value="">全部地点</option>
              {LOCATION_OPTIONS.filter((m) => !region || m.region === region).map((m) => (
                <option key={m.value} value={m.value} title={m.hint}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {view === "calendar" && (
            <BoardCalendar board={board} bandDays={bandDays} today={today} />
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
export function BoardCalendar({
  board,
  bandDays,
  today,
}: {
  board: ProviderBoard;
  bandDays: number;
  /** 由服务端给 —— 客户端自己算会跟服务端渲染出来的 HTML 对不上（时区） */
  today: string;
}) {
  // 最后一带不够一整行就用空日子补齐 —— 半截的带子右边缺一块，整张表像被啃了一口。
  // **不越过窗口上界**：补过头等于偷偷把「只看四周」放宽了
  const days = padDaysToFullBands(board.days, bandDays, providerWindowBounds(today).to);
  // 整张日历只有一组泳道（不像原来每个资源一行），包成一个「行」丢进分带
  const bands = splitBoardIntoBands<ProviderBlock, { booked: ProviderBlock[]; lanes: ProviderBlock[][] }>(
    { days, rows: [{ booked: [], lanes: board.lanes }] },
    bandDays
  );

  // **所有带子共用一份列模板**，按满一带的天数算 —— 最后一带短几天就空几列。
  // 各带各按自己的天数分列的话，短的那带列会被拉宽，上下两排日期对不上，
  // 看着像两张表拼的（排期总览也是这么干的）。
  const perBand = Math.min(clampProviderBandDays(bandDays), Math.max(1, days.length));
  const columns = `repeat(${perBand}, minmax(${PROVIDER_COL_WIDTH}px, 1fr))`;
  const minWidth = perBand * PROVIDER_COL_WIDTH + Math.max(0, perBand - 1) * PROVIDER_COL_GAP;
  const items = collapseEmptyBands(bands);

  return (
    <>
      {/* **一个框，带子在里面摞着**，不是一带一个框。中间断开的话，同一条时间轴
          看着像两张表；而且两个框之间那道缝还得再补一次边距。
          外面这层横着滚：窄到放不下 56px 一列的时候（手机），滚它 */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
        <div style={{ minWidth }}>
          {items.map((item, i) =>
            item.kind === "band" ? (
              <Band
                key={item.band.days[0] ?? i}
                band={item.band}
                today={today}
                columns={columns}
                last={i === items.length - 1}
              />
            ) : (
              <div key={`gap-${item.from}`} style={gapStyle}>
                {shortLabel(item.from).date} – {shortLabel(item.to).date} 没有安排，也没有能接的需求
              </div>
            )
          )}
        </div>
      </div>
      {/* 窗口外的单子**不藏着不说**：日历只看四周内，但「还有几单在更远处」
          得让他知道，不然会以为一共就这些 */}
      {board.outsideWindowCount > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "8px 0 0" }}>
          还有 {board.outsideWindowCount} 单在四周以后，日历上暂时不画 —— 到日子附近了自然会出现。
        </p>
      )}
    </>
  );
}

function Band({
  band,
  today,
  columns,
  last,
}: {
  band: ProviderBand;
  today: string;
  /**
   * 列模板由外面给（所有带子共用一份）。**列是弹性的**：容器宽了就一起撑开、
   * 把整行填满；窄到放不下 56px 一列的时候停在 56，外面那层横着滚（手机上就是这种）。
   * 一行最多还是排「每行几天」那么多天 —— 撑开的是列宽，不是天数。
   *
   * 用 grid 而不是「算好像素再绝对定位」：块跨几天就是 `span 几`，跟表头那排天然对齐，
   * 不用把列宽和间距在两处各算一遍（第二份数字和第二份样式是同一个 bug）
   */
  columns: string;
  last: boolean;
}) {
  const lanes = band.rows[0].lanes;

  return (
    <div style={{ marginBottom: last ? 0 : BAND_GAP }}>
      <div>
        <BoardDayHeader days={band.days} today={today} columns={columns} />

        {/* **底下固定空一格。** 选资源的浮层贴在被点那个块下面，而这块地
            `overflowX: auto` 会把超出去的部分连着竖着一起切掉。空一格是留给它的 ——
            点开之后再临时长高做不到了：开没开是客户端的事，服务端不知道 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: columns,
            gap: PROVIDER_COL_GAP,
            gridAutoRows: `${LANE_H}px`,
          }}
        >
          {lanes.map((lane, laneIndex) =>
            lane.map((b) => {
              const place = {
                gridColumn: `${b.startIndex + 1} / span ${b.length}`,
                gridRow: laneIndex + 1,
              };
              const base = { ...blockBase, ...place };
              // 已排是我自己的占用，不是能接的单 —— 点了也没有下一步
              if (b.kind === "booked") {
                return (
                  <div
                    key={`k-${b.startIndex}-${b.gap}`}
                    style={{ ...base, ...bookedStyle }}
                    title={b.title}
                  >
                    <div style={blockTitleStyle}>{b.location}</div>
                    <div style={blockSubStyle}>{b.gap}</div>
                  </div>
                );
              }
              // 一张能接的资源都没有（还没挂资源时那张预告），或者能接的都已经提过了 ——
              // 两种都不给点：点进去没有下一步，别让人白点
              if (b.fits.length === 0) {
                return (
                  <div
                    key={`${b.orderId}-${b.startIndex}`}
                    style={{ ...base, ...previewStyle }}
                    title={b.title}
                  >
                    <div style={blockTitleStyle}>{b.location}</div>
                    <div style={blockSubStyle}>{b.gap}</div>
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
                    <div style={blockTitleStyle}>{b.location}</div>
                    <div style={blockSubStyle}>已提意向</div>
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
                  popoverPlace={{
                    gridColumn: `${b.startIndex + 1} / -1`,
                    gridRow: laneIndex + 2,
                  }}
                />
              );
            })
          )}
          {/* 空那一格：grid 只给放了东西的行开行，所以拿一个占位的把它撑出来 */}
          <div style={{ gridRow: Math.max(1, lanes.length) + 1, gridColumn: 1 }} />
        </div>
      </div>
    </div>
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
  lineHeight: 1.4,
  padding: "2px 5px",
  boxSizing: "border-box",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

// 两行都可能比块宽（一天的单子才 56px），各自省略号截断
const blockLineStyle: React.CSSProperties = {
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};
/** 第一行（地点）压过第二行一档：一眼先看见是哪个地点，再看还差几张 */
const blockTitleStyle: React.CSSProperties = { ...blockLineStyle, fontWeight: 500 };
const blockSubStyle: React.CSSProperties = { ...blockLineStyle, opacity: 0.85 };

const bookedStyle: React.CSSProperties = {
  background: "var(--st-assigned-bg)",
  border: "1px solid var(--st-assigned-border)",
  color: "var(--st-assigned-text)",
};
/**
 * **能接的单子画成实心的绿块**，不再是虚线框。原来一片灰虚线，看着像占位符，
 * 而这些正是要他动手的东西 —— 排期总览那边订单就是实心色块，颜色自己会说话。
 *
 * 这一页的颜色是自成一套的，跟订单状态无关（物主看不到订单状态）：
 * 绿 = 我能接、橙 = 我提过了、蓝 = 已排出去、灰 = 接不了（还没挂资源时那张预告）。
 * 颜色全是 lib/theme.ts 里现成的 token 对，两套配色都有。
 */
const candidateStyle: React.CSSProperties = {
  background: "var(--st-complete-bg)",
  border: "1px solid var(--st-complete-border)",
  color: "var(--st-complete-text)",
  cursor: "pointer",
};
/** 还没挂资源时那张预告：一个资源都没有，一个都接不了 —— 灰着，也点不动 */
const previewStyle: React.CSSProperties = {
  background: "var(--st-created-bg)",
  border: "1px solid var(--st-created-border)",
  color: "var(--st-created-text)",
  cursor: "default",
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
// 空档那条提示现在长在同一个框里，所以不自己画边框了 —— 上下各一条分隔线就够
const gapStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "var(--text-faint)",
  background: "var(--surface-2)",
  borderTop: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
};
const controlRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  margin: "10px 0 8px",
};
/**
 * 这一行里段控件和下拉框摆在一起，**高度写死同一个数**：段控件本来 33px、
 * 下拉 26px，挨着就是一排高低不齐的框（admin 那排筛选踩过同一个坑）。
 *
 * 30 不是「刚好够」：12px 的字撑开约 15px，减掉上下边框和内边距还剩 20，
 * 留了 5px 余量 —— CI 上的字体宽一点也不会被切。
 */
const CONTROL_H = 30;
const selectStyle: React.CSSProperties = {
  height: CONTROL_H,
  boxSizing: "border-box",
  padding: "4px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 12,
  maxWidth: 150,
};
const toggleRowStyle: React.CSSProperties = {
  display: "inline-flex",
  height: CONTROL_H,
  boxSizing: "border-box",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  overflow: "hidden",
};
const segStyle: React.CSSProperties = {
  padding: "0 14px",
  border: "none",
  background: "none",
  cursor: "pointer",
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
