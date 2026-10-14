"use client";

import Link from "next/link";
import FilterForm from "@/app/admin/orders/FilterForm";
import PanelScroller from "./PanelScroller";
import CollapsibleResourcePanel from "./CollapsibleResourcePanel";
import CollapsibleFilters from "./CollapsibleFilters";
import SortMenu from "./SortMenu";
import { AssignResourceButton } from "./AssignActions";
import { publishPanelData, useAssignSelection } from "./assignSelection";
import { compareResources, type ResourceSort } from "@/lib/resourceSort";
import { formatDayRanges } from "@/lib/dates";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import { formatRun, sortChronologically, toBookingRuns, type Booking } from "@/lib/booking";
import { explain, type PastUse, type Scored } from "@/lib/recommend";
import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_LABELS,
  abnormalBadge,
  coversOrder,
  formatValidity,
  itemConflictReason,
} from "@/lib/resourceStatus";
import { recommendationsFor, resourceOpenFor, type PanelOrder } from "@/lib/assignPanel";
import { inputStyle, selectStyle, buttonStyle, linkButtonStyle } from "@/lib/adminStyles";

// 排期总览左边的资源清单。
//
// 原来是 page.tsx 里的服务端组件，选中哪一单（?assign=）由服务端算好「哪些资源能配、推荐哪张」。
// 搬成客户端组件是为了**点一单当场就换**：整页渲染要一秒多，而换一单这件事不需要新数据 ——
// 资源、每个资源排在哪几天、每一单缺几张，页面上本来就有。选中哪单看 assignSelection.ts
// （当场选的优先），判断走 lib/assignPanel.ts（跟顶上浮动条的候选同一份）。
// 筛选、排序照旧是 URL 参数、回服务端（它们改的是「列哪些资源」，要新数据）。

// 资源面板的宽度。卡片从三行压成两行之后加宽的：名字和「年龄·生日」并到同一行，
// 最长的那张（Isabelle Cheung 25岁 · 2001-07-08）光这两段就要 211px，
// 再加右边的类型和内边距约 279 —— 给到 320 是留出余量，别卡着边界算
// （零余量的布局只是在这台机器上碰巧成立，字体差一点就破）。
// 多出来的 60px 从日历那边借，不到半个日期列，换的是一屏多看三四个资源。
// 资源面板的宽度。320 → 260：卡片上去掉年龄和类型、日期区间又压短之后
// （27岁 · 1999-04-16 → 1999-04-16，9/19~9/20 → 9/19-20），
// 第一行最长的那张（Isabelle Cheung 2001-07-08）只要 173.7px 了，
// 加卡片内边距 20 和面板那一圈 20 是 214，260 留 46px 余量。
//
// 下限不是第一行定的，是第二行「已排 …」定的 —— 那行超出会横滑（故意的），
// 所以问题是「多少个资源一眼看不全」。46 张真实数据量下来：
//   220 → 7 张被截    240 → 4 张    260 → 2 张    320 → 2 张
// 260 和 320 截断的张数一样，白省 60px；再窄到 240 就开始有代价了。
// 省下来的宽度都给日历。
const PANEL_WIDTH = 260;

export default function ResourcePanel({
  assignHistory,
  bookingsByResource,
  orderRegion,
  orderMtn,
  season,
  showAllCards,
  showAllHref,
  hideUnusableHref,
  allResources,
  resourceIds,
  filters,
  sortBy,
  sortHrefs,
  hasFilter,
  total,
  loadError,
  bookedDays,
  serverAssigningId,
  orders,
  today,
  initialCollapsed,
  filtersCollapsed,
}: {
  assignHistory: PastUse[];
  bookingsByResource: Record<string, Booking[]>;
  showAllCards: boolean;
  showAllHref: string;
  hideUnusableHref: string;
  /** 全部资源（这一季沾边的），浮动条「打名字分配」用；左边列的是 resourceIds 那几张 */
  allResources: any[];
  /** 左边按筛选列出来的资源（按顺序），从 allResources 里取 —— 不另传一份资源的数据 */
  resourceIds: string[];
  filters: {
    item: string;
    gender: string;
    sstatus: string;
    q: string;
    sregion: string;
    smtn: string;
  };
  /** 资源清单按什么排 —— 跟筛选条件一样记在 URL 里 */
  sortBy: ResourceSort;
  sortHrefs: Record<ResourceSort, string>;
  orderRegion: string;
  orderMtn: string;
  /** 正在看的季（URL 上的 season，今天这季是空）。筛资源、清除筛选都不能把它冲掉 */
  season: string;
  hasFilter: boolean;
  total: number;
  loadError?: string;
  bookedDays: Record<string, string[]>;
  /** 服务端渲染的 ?assign=<id>。点下去当场选中的（InstantAssign）优先，见 assignSelection.ts */
  serverAssigningId: string | null;
  /** 每一单算资源清单要的那几样（lib/assignPanel.ts），选中哪单取哪单 */
  orders: Record<string, PanelOrder>;
  /** 今天，服务端给的（客户端自己算会跟服务端差一天，CLAUDE.md「今天是哪天」） */
  today: string;
  initialCollapsed: boolean;
  filtersCollapsed: boolean;
}) {
  // 选中的是哪一单：当场选的优先（点了就换，不等服务端），没有就是 ?assign= 那一单
  const selectedId = useAssignSelection(serverAssigningId);
  // 浮动条（InstantAssign）点下去时来取这一份，见 assignSelection.ts
  publishPanelData({ orders, allResources, bookedDays, history: assignHistory });
  const byId = new Map(allResources.map((s: any) => [s.id, s]));
  const resources = resourceIds.map((id) => byId.get(id)).filter(Boolean) as any[];
  const assigningOrder = selectedId ? orders[selectedId] ?? null : null;
  const alreadyAssigned = new Set(assigningOrder?.assignedResourceIds ?? []);
  // 「清除」只清资源的筛选，看的是哪一季不动
  const clearHref = season ? `/admin/overview?season=${season}` : "/admin/overview";
  // 每组按选中的方式重排。库里那条 .order("date_range_start") 排的是
  // 「资源什么时候开始生效」，跟挑资源这件事没关系 —— 挑资源时脑子里的顺序要么是
  // 年龄（登记了使用人的资源，年龄要跟客户对得上），要么是出借频率
  // （谁排得多、谁一直闲着），所以做成可选的。
  const cmp = compareResources(sortBy);
  const toSortable = (s: any) => {
    const runs = bookingsByResource[s.id] ?? [];
    return {
      dateOfBirth: s.holder_date_of_birth,
      name: s.holder_name ?? "",
      timesBooked: runs.length,
      // 同一单里不连续的日子算一段，但天数要按实际的天算
      daysBooked: runs.reduce((a: number, r: any) => a + (r.days?.length ?? 0), 0),
    };
  };
  const bySort = (a: any, b: any) => cmp(toSortable(a), toSortable(b));
  const male = resources.filter((s) => s.holder_gender === "male").sort(bySort);
  const female = resources.filter((s) => s.holder_gender === "female").sort(bySort);
  const other = resources
    .filter((s) => s.holder_gender !== "male" && s.holder_gender !== "female")
    .sort(bySort);

  // 筛选收起时显示的摘要：只列跟默认不一样的那几项，
  // 不然收起来之后根本看不出物品为什么少了一半
  const filterSummary = [
    filters.q ? `"${filters.q}"` : null,
    filters.item || null,
    filters.gender === "male" ? "男资源" : filters.gender === "female" ? "女资源" : null,
    filters.sstatus !== "active"
      ? filters.sstatus === "all"
        ? "全部挂牌"
        : RESOURCE_STATUS_LABELS[filters.sstatus]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CollapsibleResourcePanel
      initialCollapsed={initialCollapsed}
      expandedWidth={PANEL_WIDTH}
    >
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        资源 Resource（
        {resources.length === total ? total : `${resources.length} / ${total}`}）
      </div>

      {loadError && (
        <p
          style={{
            color: "crimson",
            fontSize: 12,
            border: "1px solid var(--st-payment-border)",
            background: "var(--st-payment-bg)",
            borderRadius: 4,
            padding: 8,
          }}
        >
          读取资源失败：{loadError}
        </p>
      )}

      <CollapsibleFilters
        initialCollapsed={filtersCollapsed}
        hasFilter={hasFilter}
        summary={filterSummary}
        clearHref={clearHref}
        sortSlot={<SortMenu current={sortBy} hrefFor={sortHrefs} />}
      >
      <FilterForm
        action="/admin/overview"
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        {assigningOrder && (
          <input type="hidden" name="assign" value={assigningOrder.id} />
        )}
        {/* 顶上那两个订单筛选也在 URL 上，这个表单一提交会把它们冲掉，原样带过去 */}
        {orderRegion && <input type="hidden" name="region" value={orderRegion} />}
        {orderMtn && <input type="hidden" name="mtn" value={orderMtn} />}
        {season && <input type="hidden" name="season" value={season} />}
        <input
          key={`q-${filters.q}`}
          name="q"
          defaultValue={filters.q}
          placeholder="搜物主姓名"
          // boxSizing 不能少：inputStyle 带 6px 内边距 + 1px 边框，<input> 默认按
          // content-box 算，width:100% 会比下面那几个 <select>（浏览器默认 border-box）
          // 宽出 14px，右边就对不齐了
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <select
            key={`item-${filters.item}`}
            name="item"
            defaultValue={filters.item}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">全部资源</option>
            <option value="beta">beta</option>
            <option value="alpha">alpha</option>
          </select>
          <select
            key={`gender-${filters.gender}`}
            name="gender"
            defaultValue={filters.gender}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">男女不限</option>
            <option value="male">男资源</option>
            <option value="female">女资源</option>
          </select>
        </div>
        {/* 上次去的区域。顶上按区域筛订单、这里按同一片筛资源，
            就能只在「一直在这一片用」的资源里配 —— 资源的使用轨迹前后一致，
            也正是推荐算法里「同一片区域」那条信号 */}
        <div style={{ display: "flex", gap: 6 }}>
          <select
            key={`sregion-${filters.sregion}`}
            name="sregion"
            defaultValue={filters.sregion}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">上次去哪都行</option>
            {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <option key={r} value={r}>
                上次去过 {REGION_LABELS[r]}
              </option>
            ))}
            <option value="none">只看还没排过的</option>
          </select>
          {/* 具体到地点。选了「只看还没排过的」就没得筛了 —— 那批资源本来就没去过地点 */}
          <select
            key={`smtn-${filters.smtn}`}
            name="smtn"
            defaultValue={filters.smtn}
            disabled={filters.sregion === "none"}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">哪个地点都行</option>
            {LOCATION_OPTIONS.filter(
              (m) => !filters.sregion || m.region === filters.sregion
            ).map((m) => (
              <option key={m.value} value={m.value}>
                {m.value} · {m.label}
              </option>
            ))}
          </select>
        </div>
        {(filters.smtn || (filters.sregion && filters.sregion !== "none")) && (
          <span style={{ fontSize: 11, color: "var(--text-faint)", marginTop: -2 }}>
            还没排过的资源不受这条影响，一直显示
          </span>
        )}
        <select
          key={`sstatus-${filters.sstatus}`}
          name="sstatus"
          defaultValue={filters.sstatus}
          style={{ ...selectStyle, width: "100%" }}
        >
          {RESOURCE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {RESOURCE_STATUS_LABELS[st]}
            </option>
          ))}
          <option value="all">全部挂牌</option>
        </select>
        {/* 没有「筛选」按钮：选完就自动筛（FilterForm 干的），少点一下 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          {hasFilter ? (
            <>
              <span style={{ color: "var(--warn)" }}>{resources.length} 张</span>
              <Link href={clearHref} style={linkButtonStyle}>
                清除
              </Link>
            </>
          ) : (
            <span style={{ color: "var(--text-faint)" }}>选完自动筛</span>
          )}
        </div>
      </FilterForm>
      </CollapsibleFilters>

      {resources.length === 0 ? (
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>
          {hasFilter ? "没有符合条件的资源。" : "还没挂资源。"}
        </p>
      ) : (
        <PanelScroller>
          <ResourceGroup
            title="男资源"
            symbol="♂"
            list={male}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            gap={assigningOrder?.maleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
            assignHistory={assignHistory}
            bookingsByResource={bookingsByResource}
            allResources={resources}
            showAllCards={showAllCards}
            showAllHref={showAllHref}
            hideUnusableHref={hideUnusableHref}
            today={today}
          />
          <ResourceGroup
            title="女资源"
            symbol="♀"
            list={female}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            gap={assigningOrder?.femaleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
            assignHistory={assignHistory}
            bookingsByResource={bookingsByResource}
            allResources={resources}
            showAllCards={showAllCards}
            showAllHref={showAllHref}
            hideUnusableHref={hideUnusableHref}
            today={today}
          />
          {other.length > 0 && (
            <ResourceGroup
              title="性别未填"
              symbol="?"
              list={other}
              bookedDays={bookedDays}
              assigningOrder={null}
              gap={0}
              alreadyAssigned={alreadyAssigned}
              assignHistory={assignHistory}
              bookingsByResource={bookingsByResource}
              allResources={resources}
              showAllCards={showAllCards}
              showAllHref={showAllHref}
              hideUnusableHref={hideUnusableHref}
              today={today}
            />
          )}
        </PanelScroller>
      )}
    </CollapsibleResourcePanel>
  );
}

function ResourceGroup({
  title,
  symbol,
  list,
  bookedDays,
  assigningOrder,
  gap,
  alreadyAssigned,
  assignHistory,
  bookingsByResource,
  allResources,
  showAllCards,
  showAllHref,
  hideUnusableHref,
  today,
}: {
  title: string;
  symbol: string;
  list: any[];
  bookedDays: Record<string, string[]>;
  assigningOrder: PanelOrder | null;
  gap: number;
  alreadyAssigned: Set<string>;
  assignHistory: PastUse[];
  bookingsByResource: Record<string, Booking[]>;
  allResources: any[];
  showAllCards: boolean;
  showAllHref: string;
  hideUnusableHref: string;
  today: string;
}) {
  if (list.length === 0) return null;

  // 这个资源现在能不能配给这一单 —— 三条硬校验，跟服务端那份是同一套。
  // 推荐只在通过校验的资源里排序，绝不放宽任何一条。
  // 判断本身在 lib/assignPanel.ts（顶上浮动条的候选也用它）
  const canAssignResource = (s: any) => {
    if (!assigningOrder || alreadyAssigned.has(s.id) || gap <= 0) return false;
    return resourceOpenFor(s, assigningOrder, bookedDays[s.id] ?? []);
  };

  // 推荐按性别分组各算各的：一单要一张男资源加一张女资源，
  // 两边各自挑自己的最优，不能混在一起比
  // 这一组里真正配得出去的有几张 —— 「还差 N 张」只说了缺口，
  // 不说手上还有多少可选，看到「还差 2 张」时不知道是有得挑还是根本没资源
  const assignable = assigningOrder ? list.filter(canAssignResource) : [];

  // 分配时把配不了的资源藏起来：一屏里大半是「已配齐」「已被占用」「类型不对」，
  // 全是噪音，真正能点的那两张反而要找。
  // **已经配给这一单的留着** —— 得看得见配了谁，也得能撤。
  const visible =
    assigningOrder && !showAllCards
      ? list.filter((s: any) => alreadyAssigned.has(s.id) || canAssignResource(s))
      : list;
  const hiddenCount = list.length - visible.length;

  // 这一单压根不需要这个性别的资源（比如「2男0女」的单，女资源那一组），
  // 整组不显示 —— 摆在那儿说「没有能配的资源」是句废话，谁都知道性别不对，
  // 而左边这一列每一行都在跟真正要看的东西抢地方。
  //
  // 只在「缺口为 0 且这一单没配过这个性别的资源」时才整组藏掉：
  // 缺口还在但一张都配不出去（「还差 1 张 无资源可选」）是要紧信息，得留着。
  if (assigningOrder && gap === 0 && visible.length === 0) return null;

  // 客户生日基本没人填（CLAUDE.md 待决定 #4），拿不到年龄这条就自动不参与
  const recommendations: Map<string, Scored> = assigningOrder
    ? recommendationsFor(
        assigningOrder,
        assignable,
        bookedDays,
        assignHistory,
        allResources.filter((s: any) => alreadyAssigned.has(s.id)).map((s: any) => s.provider_id)
      )
    : new Map();

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-faint)",
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {symbol} {title}（
          {hiddenCount > 0 ? `${visible.length}/${list.length}` : list.length}）
        </span>
        {assigningOrder && gap > 0 && (
          <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ color: "var(--warn)" }}>还差 {gap} 张</span>
            <span
              style={{ color: assignable.length > 0 ? "var(--ok)" : "var(--danger)" }}
              title={
                assignable.length > 0
                  ? "有效期覆盖、当天没被占、类型也对得上的资源"
                  : "没有资源同时满足：挂牌中、有效期覆盖这几天、当天没被占、类型对得上"
              }
            >
              {assignable.length > 0 ? `可选 ${assignable.length} 张` : "无资源可选"}
            </span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "2px 0" }}>
            没有能配的资源
          </div>
        )}
        {visible.map((s) => {
          const isAssigned = alreadyAssigned.has(s.id);
          const booked = [...new Set(bookedDays[s.id] ?? [])].sort();
          // 按订单分段、越近的越靠前。地方就那么点，排前面的才露得出来 ——
          // 一个资源去年排过十次跟今天要配的这单没关系，下周那次才有关系
          // 正序排，但这一行默认滚到最右边（CardsRowScroll 干的），
          // 所以一眼看到的是最近一次；早期的踪迹在左边，往左滑才出来
          const runs = sortChronologically(
            toBookingRuns(bookingsByResource[s.id] ?? [], today)
          );
          const badge = abnormalBadge(s);
          const listingOk = s.status === "active";
          // 卡在「订单那几天」有效即可，跟今天过没过期无关
          const covers =
            assigningOrder && coversOrder(s, assigningOrder.demandDays);
          // 第四条校验：类型要能进这个地点。地点名认不出来就不拦
          const itemConflict = assigningOrder
            ? itemConflictReason(s, assigningOrder.location)
            : null;
          // 同一个资源同一天不能给两个订单用
          const conflictDays = assigningOrder
            ? assigningOrder.demandDays.filter((d: string) => booked.includes(d))
            : [];
          const rec = recommendations.get(s.id);
          const canAssign =
            assigningOrder &&
            !isAssigned &&
            listingOk &&
            gap > 0 &&
            covers &&
            !itemConflict &&
            conflictDays.length === 0;
          // 右上角有没有东西要放：能配的（按钮 + 推荐标记）或者已配给这单的（√）。
          // 配不了的资源（只有点开「显示全部」才看得到）右上角还是显示类型，
          // 配不了的原因留在下面那一行 —— 那句话太长，塞不进角落。
          const hasAction = Boolean(assigningOrder && (canAssign || isAssigned));
          const actionSlotWidth = isAssigned ? 64 : rec?.top ? 96 : 56;

          return (
            <div
              key={s.id}
              style={{
                border: `1px solid ${isAssigned ? "var(--st-complete-border)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "8px 10px",
                background: isAssigned ? "var(--assigned-tint)" : "var(--surface)",
                // 右上角那块操作区要绝对定位（见下面 hasAction）
                position: "relative",
                // 可以拿起来拖到订单上分配（DragAssign）
                cursor: "grab",
              }}
              data-resource-id={s.id}
              data-resource-name={s.holder_name ?? "这个资源"}
            >
              <Link
                href={`/admin/resources?edit=${s.id}`}
                // 单击被 DragAssign 吞掉了（改成双击进详情），光标跟着卡片走，
                // 别显示成「这里能点开」
                draggable={false}
                // 有效期不占一行了 —— 它只在「配不了」的时候才有用，
                // 而那种时候按钮位置本来就会写明「订单日期超出有效期（…）」。
                // 平时想查就悬停看这里。
                title={`有效期 ${formatValidity(s)}　（双击打开这个资源）`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  cursor: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 6,
                    // 给右上角那块操作区让开，名字长了也不会钻到按钮底下
                    paddingRight: hasAction ? actionSlotWidth : 0,
                  }}
                >
                  {/* 名字和「年龄·生日」挤在同一行。原来生日单占一行，一个资源三行高；
                      资源有一百多张，高度就是能一屏看到几张，所以宁可横着挤也别多一行。
                      **名字让位、年龄生日不让**：名字长了打点省略，年龄是分配的硬条件
                      （登记了使用人的资源，核验时要人证相符），看不全等于这个资源没法判断 */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                      }}
                    >
                      {s.holder_name ?? "（未填物主）"}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {/* 只写生日，不写年龄。**两个都写是同一份信息写两遍** ——
                          看见 1999-04-16 就知道二十几岁，多出来的「27岁 · 」
                          在一行里只是噪音。（同一条原则：能算出来的别再存一份、
                          也别再显示一份。）
                          分配的时候仍然看得到年龄：左边候选列表的提示和色块的
                          悬停提示里都有，那两处地方够、而且正是要判断年龄的时刻。
                          生日没填要说出来 —— 年龄是分配的硬条件（登记了使用人的资源，
                          核验时要人证相符），空着不是「没关系」，是「这个资源判断不了」 */}
                      {s.holder_date_of_birth || (
                        <span style={{ color: "var(--text-faint)" }}>生日没填</span>
                      )}
                    </span>
                  </span>
                  {/* 右上角原来显示类型（"alpha"）。现在**库里所有资源都是 alpha**
                      —— 每张都写一遍等于没写，纯占地方。分配的时候这个位置本来
                      就让给「配这单」和推荐标记了，平时那一下更没必要。
                      做 Beta 的时候要加回来：那时候类型才开始有区分度，
                      而且 itemFits() 也得从「在册即 Alpha」改回按场地判断
                      （CLAUDE.md「做 Beta 功能时记得先做这件事」记着这条）。 */}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                  title={
                    runs.length > 0
                      ? runs.map(formatRun).join("\n")
                      : undefined
                  }
                >
                  {/* 就一行，高度跟原来一样。段数多了靠横滚看后面的 ——
                      多行会把每个资源撑高，一屏能看到的资源就少了，那是更贵的代价。
                      只在「这个资源现在配得出去」时才接管纵向滚轮（见 CardsRowScroll）：
                      左边是个纵向滚动的长列表，每个资源都吃掉滚轮的话列表就滚不动了 */}
                  <div
                    className="booked-row"
                    data-scrollable={canAssign ? "1" : undefined}
                    style={{ minWidth: 0, whiteSpace: "nowrap" }}
                  >
                    {runs.length === 0 ? (
                      <span style={{ color: "var(--text-faint)" }}>未排期</span>
                    ) : (
                      <>
                        {runs.map((r, i) => (
                          <span
                            key={`${r.start}-${r.location ?? ""}-${i}`}
                            // 过去的淡一点，注意力留给还没到的
                            style={{ opacity: r.past ? 0.5 : 1 }}
                          >
                            {i > 0 && <span style={{ color: "var(--text-faint)" }}> · </span>}
                            <span style={{ color: "var(--link)" }}>{r.label}</span>{" "}
                            <span style={{ color: r.location ? "var(--text-muted)" : "var(--text-faint)" }}>
                              {r.location ?? "地点没填"}
                            </span>
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                  {badge && (
                    <span style={{ flexShrink: 0, color: badge.color }}>
                      {badge.text}
                    </span>
                  )}
                </div>
              </Link>

              {/* 绝对定位放在右上角、并且**在 Link 外面** —— 塞进 Link 里就成了
                  「链接里套按钮」，点按钮会顺带跳到卡片详情页 */}
              {hasAction && (
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {rec && rec.signals.length > 0 && (
                    <span
                      title={explain(rec)}
                      style={{
                        fontSize: 11,
                        cursor: "help",
                        color: rec.top ? "var(--warn)" : "var(--text-faint)",
                        fontWeight: rec.top ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rec.signals.some((s) => s.code === "repeat-customer")
                        ? "★★ 推荐"
                        : rec.top
                          ? "★ 推荐"
                          : rec.score > 0
                            ? "☆"
                            : "⚠"}
                    </span>
                  )}
                  {isAssigned ? (
                    <span style={{ fontSize: 11, color: "var(--ok)", whiteSpace: "nowrap" }}>
                      ✓ 已配给这单
                    </span>
                  ) : (
                    <AssignResourceButton
                      orderId={assigningOrder!.id}
                      resourceId={s.id}
                      style={{
                        ...buttonStyle,
                        padding: "2px 8px",
                        fontSize: 11,
                        background: "var(--ok)",
                      }}
                    />
                  )}
                </div>
              )}

              {/* 配不了的资源才需要这一行 —— 原因那句话太长，塞不进右上角。
                  这些资源默认是藏起来的，只有点开「显示全部」才看得到 */}
              {assigningOrder && !hasAction && (
                <div
                  title={itemConflict || undefined}
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: itemConflict ? "var(--danger)" : "var(--text-faint)",
                  }}
                >
                  {!listingOk
                    ? (badge?.text ?? "不可用")
                    : gap === 0
                      ? "这个性别已配齐"
                      : itemConflict
                        ? `类型不对：${s.item_type} 进不了这个地点`
                        : !covers
                          ? `订单日期超出有效期（${formatValidity(s)}）`
                          : `${formatDayRanges(conflictDays)} 已被占用`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 藏起来的那些留个出口：偶尔想知道「某个资源为什么配不了」，
          点开就能看到「已被占用」「类型不对」那些说明 */}
      {assigningOrder && (hiddenCount > 0 || showAllCards) && (
        <div style={{ fontSize: 11, marginTop: 6 }}>
          {showAllCards ? (
            <Link href={hideUnusableHref} style={{ color: "var(--text-faint)" }}>
              只看能配的
            </Link>
          ) : (
            <Link href={showAllHref} style={{ color: "var(--text-faint)" }}>
              还有 {hiddenCount} 张配不了，点开看看为什么 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
