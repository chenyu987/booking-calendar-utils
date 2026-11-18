"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buildOverview, type OverviewParams, type OverviewRaw } from "@/lib/overviewModel";
import { isWeekend, shortLabel } from "@/lib/dates";
import { isPeakDate } from "@/lib/peakDates";
import { BAND_GAP, COL_WIDTH } from "@/lib/bandDays";
import ZoomableCalendar from "./ZoomableCalendar";
import NewOrderSelector from "./NewOrderSelector";
import OrderBlock from "./OrderBlock";
import ResourcePanel from "./ResourcePanel";
import InstantAssign from "./InstantAssign";
import DayNote from "./DayNote";
import { useLiveRaw } from "./useLiveRaw";
import { registerInstantFilter } from "@/app/admin/orders/FilterForm";
import { overviewHref, parseOverviewQuery } from "@/lib/overviewQuery";
import { RESOURCE_SORTS, type ResourceSort } from "@/lib/resourceSort";

// 排期总览的日历、资源清单、统计：**在浏览器里算、在浏览器里画**。
// 服务端只把这一季的原始数据（OverviewRaw）和筛选、设置交下来，怎么排、排在哪、统计多少
// 全走 lib/overviewModel.ts —— 服务端原来那份就是它，一行没改。
// 这样库里一改（实时更新），浏览器只要把变了的那几行合进手里的数据，再算一遍就是新样子，
// 不用整页回服务端重画。

// 所有行统一这个高度。**不要改成 auto/minmax** —— 那样分配的那一行会比别的行高，
// 每次进出编辑模式色块都跳一下，看久了很晃眼（试过，被否了）。
//
// 两个状态排成一一对应的 **2 行**，位置一样，所以进出编辑不跳、
// 也看得出哪个字段对哪个框：
//   1 姓名 · 地点 ……… 备注 | $金额   ←→  姓名框 | 地点框 ……… 状态框 | 备注框 | 金额框
//   2 男1/1 女1/1 ……… 已配的资源       ←→  男1/[框] 女1/[框] ……… 已配的资源
//
// 原来是 3 行（资源单独占一行、金额在第 3 行右下角）。一周上百单的时候，
// 每单多一行就是整张表长一截，看来看去很累，所以压成两行。
// 每行都靠一个**弹簧**（flex:1 的空 span）把右边那组顶到右边：分配态中间多出来
// 一个状态框时，弹簧自己缩掉，备注和金额一像素都不挪 —— 这是「进出编辑不动」的关键。
//
// 第 2 行是「分配进度」和「几男几女」合并的结果：进度的分母本来就是要几个人，
// 两行是同一份信息，所以分配模式把 male_count/female_count 的输入框直接摆在分母位置。
//
// 62 → 42。两行内容量出来是：
//   普通态 15.59 + 2 + 14.30 = 31.89，加内边距 4 和边框 2 → 37.89
//   分配态 16.59 + 2 + 14.30 = 32.89，加内边距 4 和边框 2 → 38.89  ← 资源高度的是这个
// 所以下限是 38.89，取 42 留 3.11px。
//
// 撑高分配态那 1px 的是状态下拉框（height:16，比普通态那行文字的 15.59 高）。
// 真要再矮，得先把它压到 15 —— 但 11px 的字塞进 15px 的框，换个平台就可能切掉半行，
// 为 1px 不值。竖直方向可以比横向贴得紧（行高是字号乘出来的，跟字体的字宽无关），
// 但也别贴到 0。
const ROW_HEIGHT = 42;

// COL_WIDTH 从 lib/bandDays 来 —— 帘子那边算「一行排得下几天」用的是同一个数，
// 各写一份迟早对不上（见那边的注释）
// 日期带那一行的高度。**跟订单色块的 ROW_HEIGHT 是同一个数**：
// 两边都是两行，高度对不上的话看着像没对齐。
//
// 52 → 42：备注从单独的第三行挪到「周几」右边（省一行），上下内边距
// 又从 4 收到 2 跟色块看齐。内容量出来是 15（日期）+ 17（周几那行，
// 按编辑时的输入框给，不是按文字）+ 内边距 4 + 边框 2 = 38，留 4px。
//
// 改其中一个的时候记得看另一个 —— 它俩现在是一对。
const HEADER_ROW_HEIGHT = ROW_HEIGHT;

type ResourcePanelProps = React.ComponentProps<typeof ResourcePanel>;
type NewOrderProps = React.ComponentProps<typeof NewOrderSelector>;
type InstantProps = React.ComponentProps<typeof InstantAssign>;

export default function OverviewBoard({
  raw: serverRaw,
  renderedAt,
  params,
  railWidth,
  serverAssigningId,
  resourcePanel,
  newOrder,
  instant,
  filters,
  legend,
}: {
  raw: OverviewRaw;
  /** 服务端这次渲染开始查库的时间（main[data-rendered-at] 同一个数）：实时合进来的、比它晚的那几批要在它上面再合一次 */
  renderedAt: number;
  /** 筛选（orderFilter / resourceFilter）是服务端从地址栏读的，只用来对照：这边自己从地址栏读（切筛选不回服务端） */
  params: Omit<OverviewParams, "hrefFor">;
  railWidth: number;
  /** 地址栏上的 ?assign=（打开页面就带着、建完新单跳过来） */
  serverAssigningId: string | null;
  /** 资源清单里跟数据无关、服务端拼好的那些（链接、cookie 里的收起状态） */
  resourcePanel: Pick<ResourcePanelProps, "season" | "initialCollapsed" | "filtersCollapsed" | "loadError">;
  newOrder: Pick<NewOrderProps, "adminName" | "adminId" | "dayPrices">;
  instant: Pick<InstantProps, "exitHref" | "deleteAction">;
  /** 筛选那一排（服务端画的，跟数据无关） */
  filters: React.ReactNode;
  /** 状态 / 管理员颜色图例（服务端画的） */
  legend: React.ReactNode;
}) {
  // 手里的原始数据：服务端给的整季那份，加上实时合进来的那几行（useLiveRaw.ts）
  const raw = useLiveRaw(serverRaw, params.season.key, renderedAt);
  // 筛选的唯一出处是地址栏（lib/overviewQuery.ts）：切区域、地点、状态、管理员、资源筛选只改地址栏，
  // 这里读出来当场重算，不回服务端。只有换季要回服务端（要另一季的数据）
  const sp = useSearchParams();
  const query = parseOverviewQuery(sp, params.admins);
  const seasonParam = params.isCurrentSeason ? "" : params.season.key;
  useEffect(() => {
    registerInstantFilter("/admin/overview", (next) => (next.get("season") ?? "") === seasonParam);
    return () => registerInstantFilter("/admin/overview", null);
  }, [seasonParam]);

  const filterKey = JSON.stringify([query.orderFilter, query.resourceFilter]);
  const model = useMemo(
    () =>
      buildOverview(raw, {
        ...params,
        orderFilter: query.orderFilter,
        resourceFilter: query.resourceFilter,
        hrefFor: (id) => overviewHref(sp, { assign: id }),
      }),
    // params 每次服务端渲染都是新对象；按内容比，别每次都重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, JSON.stringify(params), filterKey]
  );
  const { noteByDay, timeline, bands, hiddenBeforeStart, stats, instantEditors } = model;
  const { season, isCurrentSeason, today } = params;
  // 地址栏上 ?assign= 的那单（不在这季 / 被筛掉了就当没有）
  const assigningId = serverAssigningId && model.panelOrders[serverAssigningId] ? serverAssigningId : null;
  const serverAssigningIdForBands = assigningId;

  return (
    <>
      {/* 统计 / 状态图例 / 缩放 / 资源面板 / 日历 全交给 ZoomableCalendar 排版 */}
      <ZoomableCalendar
        bandDays={params.bandDays}
        railWidth={railWidth}
        panel={
          // key 是给 React 19 dev 下的检查看的：只有一个、不会重排，写死就行
          <ResourcePanel
            key="resource-panel"
            {...resourcePanel}
            orderRegion={query.orderFilter.region}
            orderMtn={query.orderFilter.mtn}
            showAllCards={query.showAllCards}
            showAllHref={overviewHref(sp, { allcards: "1" })}
            hideUnusableHref={overviewHref(sp, { allcards: "" })}
            sortBy={query.sortBy}
            sortHrefs={
              Object.fromEntries(
                (Object.keys(RESOURCE_SORTS) as ResourceSort[]).map((k) => [k, overviewHref(sp, { ssort: k })])
              ) as Record<ResourceSort, string>
            }
            assignHistory={model.assignHistory}
            bookingsByResource={Object.fromEntries(model.bookingsByResource)}
            allResources={model.modeResources}
            resourceIds={model.resources.map((s: any) => s.id)}
            filters={query.resourceFilter}
            hasFilter={model.hasFilter}
            total={model.resourceTotal}
            bookedDays={Object.fromEntries(model.bookedDays)}
            serverAssigningId={assigningId}
            orders={model.panelOrders}
            usesByResource={Object.fromEntries(model.usesByResource)}
            today={today}
          />
        }
        toolbar={
          <>
            <Stat label="本周订单数" value={String(stats.weekOrderCount)} />
            <Stat label="本周流水" value={`$${stats.weekRevenue.toLocaleString()}`} />
            <Stat label="本月流水" value={`$${stats.monthRevenue.toLocaleString()}`} />
            <Stat
              label={isCurrentSeason ? "本季流水" : `${season.label} 流水`}
              value={`$${stats.seasonRevenue.toLocaleString()}`}
            />
            <Stat
              label="本周未配齐"
              value={String(stats.weekNotFullyAssigned)}
              highlight={stats.weekNotFullyAssigned > 0}
            />
            {filters}
        {/* 有单子被挡在起点前面就说一声，并给一条改设置的路。
            悄悄少几个单子，比日历难看多了 */}
        {/* 设置是侧边栏里的弹框，不是页面（/admin/settings 只剩一条数据接口，
            链过去打开的是一段 JSON），所以这里只给文字提示，不给链接 */}
        {hiddenBeforeStart > 0 && (
          <span
            style={{ fontSize: 12, color: "var(--warn)", whiteSpace: "nowrap" }}
            title="在侧边栏「设置」里改起始日期"
          >
            起始日期之前还有 {hiddenBeforeStart} 单没显示
          </span>
        )}

            {legend}
          </>
        }
      >
        {timeline.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            还没有带日期的订单。去 <Link href="/admin/orders">Order 管理</Link> 建一个。
          </p>
        ) : (
              bands.map((band, bandIdx) => (
              <div
                key={band.days[0]}
                // 点下去当场画的分配态色块要放进这个 grid（InstantAssign）
                data-band-grid={bandIdx}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${band.days.length}, ${COL_WIDTH}px)`,
                  gridTemplateRows: `${HEADER_ROW_HEIGHT}px`,
                  // 行高写死，不用 auto：auto 会让分配的那一行比别的行高，
                  // 每次进出编辑模式整块都跳一下，看久了很晃眼。
                  // 两个状态排成同样的 2 行，写死高度就不会有跳变。
                  gridAutoRows: `${ROW_HEIGHT}px`,
                  gap: 2,
                  minWidth: "min-content",
                  marginBottom: bandIdx === bands.length - 1 ? 0 : BAND_GAP,
                }}
              >
                <NewOrderSelector
                  timeline={band.days}
                  colWidth={COL_WIDTH}
                  rowHeight={ROW_HEIGHT}
                  laneCount={band.laneCount}
                  assigningOrderId={serverAssigningIdForBands}
                  {...newOrder}
                  itemMode={params.itemMode}
                />
                {/* peak date 的整列底色。单独铺一层是因为日期条只有表头那一格，
                    往下滚就看不出这一列是不是 peak 了。gridRow 1/-1 铺满整段，
                    zIndex 0 压在订单色块下面，pointerEvents none 不挡建单的框选 */}
                {band.days.map((d, i) =>
                  isPeakDate(d) ? (
                    <div
                      key={`peak-${d}`}
                      aria-hidden
                      style={{
                        gridRow: "1 / -1",
                        gridColumn: i + 1,
                        background: "var(--peak-stripe)",
                        pointerEvents: "none",
                        zIndex: 0,
                      }}
                    />
                  ) : null
                )}
                {band.days.map((d, i) => {
                  const { date, weekday } = shortLabel(d);
                  const weekend = isWeekend(d);
                  // peak 盖过周末的橙色：限制资源那几天根本进不了场，
                  // 比「这天是周末」要紧得多
                  const peak = isPeakDate(d);
                  return (
                    <div
                      key={d}
                      // 新开标签页时用来定位到"今天"那一列
                      data-today={d === today ? "1" : undefined}
                      // 按住色块拖到别的日子（DragMove）：靠它认指针底下是哪一天
                      data-day={d}
                      title={peak ? "Alpha 限制资源的 peak date，这天进不了场" : undefined}
                      style={{
                        gridRow: 1,
                        gridColumn: i + 1,
                        // 上下内边距跟订单色块一样是 2（左右保持 6）。
                        // 原来是 4，日期带就比色块高 4px —— 两边都是两行，
                        // 高度却对不上，看着像没对齐
                        padding: "2px 6px",
                        background: peak ? "var(--peak-bg)" : weekend ? "var(--weekend-bg)" : "var(--surface-2)",
                        borderBottom:
                          d === today ? "2px solid var(--text)" : "1px solid var(--border)",
                        fontSize: 12,
                        color: peak ? "var(--peak)" : weekend ? "var(--warn)" : "var(--text-muted)",
                        // 竖着滚的时候日期条黏在顶上，不然滚下去就不知道是哪天了。
                        // zIndex 要压过订单色块（1）和空白选框（0）
                        position: "sticky",
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{date}</div>
                      {/* 周几和当天备注挤同一行，备注靠右 —— 原来备注单占第三行，
                          一屏上二三十列每列都空着一条，整条日期带白白高出一截。
                          高度 17 是按「编辑时那个输入框」给的（15 的行高 + 1px 边框
                          上下各一）：不写死的话，一点进去输入框比文字高 2px，
                          整条日期带会抖一下 */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          minHeight: 17,
                          fontSize: 11,
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>
                          {weekday}
                          {peak && " · peak"}
                        </span>
                        <span style={{ flex: "1 1 0", minWidth: 0 }}>
                          <DayNote day={d} note={noteByDay.get(d) ?? ""} peak={peak} />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* 色块的数据在 lib/overviewModel.ts 里算好了。普通态长什么样只在 OrderBlock 里，
                    进出分配态全在浏览器里（InstantAssign），服务端永远画普通态 */}
                {band.blocks.map((b) => (
                  <OrderBlock key={b.key} d={b.d} />
                ))}
              </div>
              ))
        )}
      </ZoomableCalendar>

      {/* 分配态（编辑一单）全在浏览器里：点色块当场画编辑框、资源清单、浮动条，
          退出当场画回普通态、后台存 */}
      <InstantAssign
        editors={instantEditors}
        bandDays={bands.map((b) => b.days)}
        {...instant}
        // 浮动条「打名字分配」的候选不在这儿传数据：跟左边资源清单共用一份（assignSelection.ts）
        admins={params.admins}
        primaryAdminId={params.primaryAdminId}
      />
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: highlight ? "var(--warn)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
