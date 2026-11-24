// 排期总览的「模型层」：拿这一季的原始数据（单子、资源、备注）+ 筛选和设置，算出页面要画的一切 ——
// 日历范围、每一带每单排在第几行、冲突、顶上的统计、资源清单要的数据、每个色块的数据。
//
// **纯函数，服务端和浏览器用的是同一份。** 实时更新（库里一改，浏览器只拉变了的那几行、
// 合进手里的数据再算一遍）靠的就是这一条：浏览器自己算出来的，必须跟服务端整页画出来的一模一样，
// 两份算法迟早对不上（CLAUDE.md「第二份数字和第二份样式是同一个 bug」）。
//
// 原来全写在 app/admin/overview/page.tsx 里，2026-11-18 原样搬过来，逻辑一行没改。

import { displayName, formatPerson } from "@/lib/person";
import { matchesOrderAdmin, type Admin } from "@/lib/admins";
import { orderInItemMode, resourceInItemMode, type ItemMode } from "@/lib/itemMode";
import { dateRangeToArray, contiguousRuns } from "@/lib/dates";
import { EXTRA_LANES } from "@/lib/bandDays";
import { shortHolderNames } from "@/lib/holderName";
import { resolveTimelineStart, ordersBeforeStart, resolveTimelineEnd } from "@/lib/timelineStart";
import type { ResourceUse } from "@/lib/previousUse";
import { findClashes, indexClashes, clashKey } from "@/lib/doubleBooking";
import { effectiveAdminId, frameColor, frameInnerColor, orderFrame } from "@/lib/orderFrame";
import { readNoteText } from "@/lib/orderNote";
import {
  weekBounds,
  monthFirstDay,
  countInRange,
  sumInRange,
  startsInRange,
  countsTowardRevenue,
  orderStartDay,
} from "@/lib/revenue";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { computeNeed, formatNeed, formatGap } from "@/lib/assignment";
import { isUnknownLocation, locationHintFor, matchesLocationFilter, normalizeLocation, type Region } from "@/lib/locations";
import { formatParty } from "@/lib/party";
import { calcAge } from "@/lib/age";
import type { Booking } from "@/lib/booking";
import type { PastUse } from "@/lib/recommend";
import type { PanelOrder } from "@/lib/assignPanel";
import { validityOverlaps } from "@/lib/resourceStatus";
import { compareByValidityStart } from "@/lib/validity";
import { inSeason, type Season } from "@/lib/season";
import type { BlockData } from "@/app/admin/overview/OrderBlock";
import type { EditorData } from "@/app/admin/overview/AssignEditor";
import { BLOCK_BASE_STYLE } from "@/app/admin/overview/blockGeometry";

// 最后一段底下留多一点：下面没有别的段接着了，往后加新单子都得在这儿拖。
// **这条只有排期总览有** —— 匹配台不能拖着建单
export const EXTRA_LANES_LAST = 5;

/** 这一季的原始数据：查库拿回来的样子，一行没加工（实时更新时浏览器按行合进来的也是这个形状） */
export type OverviewRaw = {
  /** orders + customers(人) + order_assignments(resource_id)，见 lib/overviewData.ts 的 ORDER_SELECT */
  orders: any[];
  /** 没删掉的资源（全部，不只这一季的：认「这单配了谁」要用全部） */
  resources: any[];
  orderNotes: { order_id: string; internal_note: string | null }[];
  dayNotes: { day: string; note: string }[];
};

export type OrderFilter = { region: Region | ""; mtn: string; status: string; admin: string };
export type ResourceFilter = {
  item: string;
  gender: string;
  sstatus: string;
  q: string;
  sregion: string;
  smtn: string;
};

export type OverviewParams = {
  season: Season;
  isCurrentSeason: boolean;
  /** 今天。**由服务端定**：浏览器自己算的话跨日那几小时跟服务端不是同一天（CLAUDE.md） */
  today: string;
  itemMode: ItemMode;
  admins: Admin[];
  primaryAdminId: string | null;
  orderFilter: OrderFilter;
  resourceFilter: ResourceFilter;
  bandDays: number;
  /** 设置里的起止日期（还没按季过滤过的原值） */
  overviewStart?: string | null;
  overviewEnd?: string | null;
  /** 色块链接（点了进这一单的分配态） */
  hrefFor: (orderId: string) => string;
};

export type Band = {
  days: string[];
  colIndex: Map<string, number>;
  laneOf: Map<string, number>;
  laneCount: number;
  /** 这一带里的色块（一单一个连续段一个） */
  blocks: { key: string; d: BlockData }[];
};

export type OverviewStats = {
  weekOrderCount: number;
  weekRevenue: number;
  monthRevenue: number;
  seasonRevenue: number;
  weekNotFullyAssigned: number;
};

const shiftDay = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export function buildOverview(raw: OverviewRaw, p: OverviewParams) {
  const { season, isCurrentSeason, today, itemMode, admins, primaryAdminId, orderFilter } = p;
  const orders = raw.orders;
  const rawResources = raw.resources;

  const noteByDay = new Map<string, string>(raw.dayNotes.map((n) => [n.day, n.note]));

  // 订单备注：色块右上角显示用。internal_note 这一列里还混着「取消原因」写进去的
  // JSON 信封（那个功能的代码没了，数据还在），统一走 readNoteText 拆一层，
  // 别把整段 JSON 印到色块上
  const noteByOrder = new Map<string, string>();
  for (const n of raw.orderNotes) {
    const t = readNoteText(n.internal_note);
    if (t) noteByOrder.set(n.order_id, t);
  }

  // 资源：只列有效期跟这一季沾边的（往年的资源配不了今年的单，列出来只是占地方）。
  // 但**认分配记录用全部的** —— 一单配的资源万一有效期对不上这季（以前留下的），
  // 也得照样显示「配了谁」，不能让它看着像没配
  // 按开始生效排（见 lib/validity.ts 的 compareByValidityStart）
  const allResources = rawResources
    .filter((s: any) => validityOverlaps(s, season.start, season.end))
    .sort(compareByValidityStart);
  const resourceById = new Map(rawResources.map((s: any) => [s.id, s]));
  const orderById = new Map(orders.map((o: any) => [o.id, o]));
  const assignments = orders.flatMap((o: any) =>
    (o.order_assignments ?? []).map((a: any) => ({ order_id: o.id, resource_id: a.resource_id }))
  );

  const assignedTo = new Map<string, any[]>();
  // 每个资源被订单占用了哪几天 —— 用来在卡片上显示「已排 9/10~9/12」
  const bookedDays = new Map<string, string[]>();
  for (const a of assignments) {
    const s = resourceById.get(a.resource_id);
    if (!s) continue;
    assignedTo.set(a.order_id, [...(assignedTo.get(a.order_id) ?? []), s]);
    const o: any = orderById.get(a.order_id);
    if (o?.demand_days?.length) {
      bookedDays.set(a.resource_id, [...(bookedDays.get(a.resource_id) ?? []), ...o.demand_days]);
    }
  }

  // 推荐分配要看的历史：每个资源以前被配给过哪些单、那些单去了哪、走到哪一步了。
  // 资源清单那行「已排 …」要按订单分组显示（哪几天去哪个地点），
  // 跟 bookedDays 那个并集不是一回事：并起来就丢了「哪几天去哪」
  const bookingsByResource = new Map<string, Booking[]>();
  const usesByResource = new Map<string, ResourceUse[]>();
  const assignHistory: PastUse[] = [];
  for (const a of assignments) {
    const o: any = orderById.get(a.order_id);
    if (!o) continue;
    bookingsByResource.set(a.resource_id, [
      ...(bookingsByResource.get(a.resource_id) ?? []),
      { days: o.demand_days ?? [], location: o.location ?? null },
    ]);
    // 多带一个 orderId —— 分配时要顺着它找回「这个资源上一单是哪一单」，好把那一单点亮
    usesByResource.set(a.resource_id, [
      ...(usesByResource.get(a.resource_id) ?? []),
      { orderId: a.order_id, days: o.demand_days ?? [] },
    ]);
    assignHistory.push({
      resourceId: a.resource_id,
      customerId: o.customer_id ?? null,
      location: o.location ?? null,
      status: o.status,
      days: o.demand_days ?? [],
    });
  }

  // 每个资源上一次去的是哪一片区域（最近一次，按结束日期最大）。认不出地点名的那几段跳过
  const lastVenueOf = (resourceId: string) => {
    let best: { end: string; venue: ReturnType<typeof normalizeLocation> } | null = null;
    for (const b of bookingsByResource.get(resourceId) ?? []) {
      const venue = normalizeLocation(b.location);
      if (!venue) continue;
      const end = [...(b.days ?? [])].sort().at(-1);
      if (!end) continue;
      if (!best || end > best.end) best = { end, venue };
    }
    return best?.venue ?? null;
  };

  // 左边卡片清单的筛选
  const f = p.resourceFilter;
  // 色块里那行「已配的资源」显示成什么：默认只写 first name，撞名的才往后补姓氏字母。
  // **用 allResources 而不是筛选后的 resources**：撞名这件事跟筛选无关
  const holderLabels = shortHolderNames(allResources.map((s: any) => s.holder_name ?? ""));

  // 开关切到 Alpha / Beta 时，资源清单和分配候选只剩这一边的资源
  const modeResources = allResources.filter((s: any) => resourceInItemMode(s.item_type, itemMode));
  const resources = modeResources.filter((s: any) => {
    if (f.item && s.item_type !== f.item) return false;
    if (f.gender && s.holder_gender !== f.gender) return false;
    if (f.sstatus !== "all" && s.status !== f.sstatus) return false;
    if (f.q && !(s.holder_name ?? "").toLowerCase().includes(f.q)) return false;
    if (f.sregion || f.smtn) {
      const last = lastVenueOf(s.id);
      if (f.sregion === "none") {
        if (last !== null) return false;
      } else if (last !== null) {
        // **还没排过的资源一律不筛掉**：它对哪一片都可用
        if (f.smtn && last.canonical !== f.smtn) return false;
        if (f.sregion && last.region !== f.sregion) return false;
      }
    }
    return true;
  });
  const hasFilter = Boolean(f.item || f.gender || f.q || f.sregion || f.smtn || f.sstatus !== "active");
  const resourceTotal = modeResources.length;

  // 按区域 / 地点 / 状态 / 管理员 / 类型筛订单：**只筛日历和统计**，不筛资源面板那边的排期历史
  const matchesOrderFilter = (o: any) => {
    if (!orderInItemMode(o.location, itemMode)) return false;
    if (orderFilter.status && o.status !== orderFilter.status) return false;
    if (!matchesOrderAdmin(effectiveAdminId(o.admin_id, primaryAdminId), orderFilter.admin)) return false;
    return matchesLocationFilter(o.location, orderFilter);
  };
  const withDays = orders.filter(
    (o: any) => o.demand_days && o.demand_days.length > 0 && matchesOrderFilter(o)
  );
  const allDays = withDays.flatMap((o: any) => o.demand_days).sort();

  const DAYS_PER_BAND = p.bandDays;

  // 设置里的起止日期只在这一季里面再缩小范围：落在这季外面的就当没设
  const startSetting = p.overviewStart && inSeason(p.overviewStart, season) ? p.overviewStart : undefined;
  const endSetting = p.overviewEnd && inSeason(p.overviewEnd, season) ? p.overviewEnd : undefined;

  // 日历要盖住的几个点：这季的单子；看的是今天这季的话还有今天；都没有就从季初画起
  const anchors = [...allDays];
  if (inSeason(today, season)) anchors.push(today);
  if (anchors.length === 0) anchors.push(season.start);
  anchors.sort();

  let timeline: string[] = [];
  {
    const earliest = anchors[0];
    const latest = anchors[anchors.length - 1];
    // 起点先往前留两天，再退到那一周的周一。界面上指定了开始日期就原样用它
    const firstPadded = shiftDay(earliest, -2);
    const backToMonday = (new Date(`${firstPadded}T00:00:00Z`).getUTCDay() + 6) % 7;
    const start = resolveTimelineStart(startSetting, shiftDay(firstPadded, -backToMonday));
    // 起点被拖到所有单子后面时，末尾至少给起点留出一段
    let end = shiftDay(latest > start ? latest : start, 10);
    timeline = dateRangeToArray(start, end);
    // 补齐最后一段
    const remainder = timeline.length % DAYS_PER_BAND;
    if (remainder !== 0) {
      end = shiftDay(end, DAYS_PER_BAND - remainder);
      timeline = dateRangeToArray(start, end);
    }
    // 最后一段必须是空的：留一整段空白在最底下，往后加新单子随时有地方拖
    while (
      withDays.some((o: any) =>
        (o.demand_days as string[]).some((d) => timeline.slice(timeline.length - DAYS_PER_BAND).includes(d))
      )
    ) {
      end = shiftDay(end, DAYS_PER_BAND);
      timeline = dateRangeToArray(start, end);
    }
    // 界面上指定了结束日期就原样截到那天
    const explicitEnd = resolveTimelineEnd(endSetting, start);
    if (explicitEnd) timeline = dateRangeToArray(start, explicitEnd);
  }

  // 起点定在中间的时候，整单落在起点之前的就看不见了。数出来告诉人
  const hiddenBeforeStart = timeline.length > 0 ? ordersBeforeStart(withDays as any[], timeline[0]).length : 0;

  // 库里已经存在的「同一个资源同一天配给两单」，照样查一遍标红
  const clashIndex = indexClashes(findClashes(usesByResource));
  const orderNameById = new Map<string, string>(
    (withDays as any[]).map((o) => [o.id, displayName(o.customers, "另一单")])
  );

  const sorted = [...withDays].sort((a: any, b: any) => (a.demand_days[0] < b.demand_days[0] ? -1 : 1));

  // 每段单独排泳道：这一段只有一个单子就只占一行
  const bands: Band[] = [];
  for (let i = 0; i < timeline.length; i += DAYS_PER_BAND) {
    const days = timeline.slice(i, i + DAYS_PER_BAND);
    const inBand = new Set(days);
    const bandLanes: string[][] = [];
    const laneOf = new Map<string, number>();
    for (const o of sorted as any[]) {
      const daysHere = (o.demand_days as string[]).filter((d) => inBand.has(d));
      if (daysHere.length === 0) continue;
      let lane = 0;
      while (bandLanes[lane] && bandLanes[lane].some((d) => daysHere.includes(d))) lane += 1;
      bandLanes[lane] = [...(bandLanes[lane] ?? []), ...daysHere];
      laneOf.set(o.id, lane);
    }
    const isLastBand = i + DAYS_PER_BAND >= timeline.length;
    bands.push({
      days,
      colIndex: new Map(days.map((d, j) => [d, j])),
      laneOf,
      laneCount: bandLanes.length + (isLastBand ? EXTRA_LANES_LAST : EXTRA_LANES),
      blocks: [],
    });
  }

  // 顶上那几个数字。口径见 lib/revenue.ts：单子按最早那天归属（跨周不拆），
  // 三个流水的结束点都是本周日
  const { start: weekStart, end: weekEnd } = weekBounds(today);
  const stats: OverviewStats = {
    weekOrderCount: countInRange(withDays, weekStart, weekEnd),
    weekRevenue: sumInRange(withDays, weekStart, weekEnd),
    monthRevenue: sumInRange(withDays, monthFirstDay(today), weekEnd),
    // 季流水 = 最早那天落在这季里的单。看往年那季时，结束点就是那季最后一天
    seasonRevenue: sumInRange(withDays, season.start, isCurrentSeason && weekEnd < season.end ? weekEnd : season.end),
    // 本周未配齐：同一套归属规则，取消/退款的单子不用分配所以排除掉
    weekNotFullyAssigned: withDays.filter(
      (o: any) =>
        startsInRange(o, weekStart, weekEnd) &&
        countsTowardRevenue(o.status) &&
        !computeNeed(o, assignedTo.get(o.id) ?? []).isComplete
    ).length,
  };

  // 左边资源清单要的：每一单算一份「缺几张、配了哪几张、哪几天、哪个地点」
  const panelOrders: Record<string, PanelOrder> = {};
  for (const o of withDays as any[]) {
    const assigned = assignedTo.get(o.id) ?? [];
    const need = computeNeed(o, assigned);
    panelOrders[o.id] = {
      id: o.id,
      customerId: o.customer_id ?? null,
      customerDob: o.customers?.date_of_birth ?? null,
      location: o.location ?? null,
      demandDays: o.demand_days ?? [],
      maleGap: need.maleGap,
      femaleGap: need.femaleGap,
      assignedResourceIds: assigned.map((x: any) => x.id),
    };
  }

  // 每个色块的数据 + 每一单分配态的数据（InstantAssign 点下去当场画）
  const instantEditors: Record<string, EditorData & { band: number }> = {};
  bands.forEach((band, bandIdx) => {
    for (const o of sorted as any[]) {
      const bandLane = band.laneOf.get(o.id);
      if (bandLane === undefined) continue;
      const cards = assignedTo.get(o.id) ?? [];
      const note = noteByOrder.get(o.id) ?? "";
      // 地点名库里认不出来 —— 标红提醒去改，**不自动改**
      const badLocation = isUnknownLocation(o.location);
      const locationHint = badLocation ? locationHintFor(o.location!) : "";
      const need = computeNeed(o, cards);
      // 分配模式里那几个输入框用的是 defaultValue（不受控），值一变就得重新挂载：拼进 key
      const editStateKey = [
        o.amount,
        o.status,
        o.male_count,
        o.female_count,
        o.location,
        displayName(o.customers, ""),
        noteByOrder.get(o.id) ?? "",
      ].join("|");
      const allSorted = [...(o.demand_days as string[])].sort();
      const firstDayOverall = allSorted[0];
      const firstDayInBand = allSorted.find((d) => band.colIndex.has(d));
      for (const run of contiguousRuns(o.demand_days)) {
        // 连续段跟带子的边界不一定对齐，切出落在这一段里的那截
        const seg = run.filter((d) => band.colIndex.has(d));
        if (seg.length === 0) continue;
        const start = band.colIndex.get(seg[0])!;
        const segKey = `${o.id}-${seg[0]}-${editStateKey}`;
        // 整个连续段都在这一段里才给拖拽改天数的把手
        const runFullyInBand = seg.length === run.length;
        // 摘要每段显示一次，编辑控件全局只出现一次
        const showDetail = seg[0] === firstDayInBand;
        const showEdit = seg[0] === firstDayOverall;
        const c = statusColor(o.status);
        // 边框和光圈一处算（lib/orderFrame.ts）
        const orderAdminId = effectiveAdminId(o.admin_id, primaryAdminId);
        const providerColor = frameColor(o.location, orderAdminId, admins, primaryAdminId);
        const innerColor = frameInnerColor(o.location, orderAdminId, admins, primaryAdminId);
        const frame = orderFrame({ statusBorder: c.border, adminColor: providerColor, innerColor, assigning: false });
        const blockStyle = {
          gridRow: bandLane + 2,
          gridColumn: `${start + 1} / span ${seg.length}`,
          background: c.bg,
          border: frame.border,
          boxShadow: frame.boxShadow,
          color: c.text,
          ...BLOCK_BASE_STYLE,
        } as const;
        const blockTitle = [
          formatPerson(o.customers),
          `${o.location ?? "?"} · ${formatParty(o.male_count, o.female_count)} · ${o.demand_days.length}天`,
          `$${o.amount ?? "?"} · ${STATUS_LABELS[o.status] ?? o.status}`,
          `分配 ${formatNeed(need)}（${formatGap(need)}）`,
          ...(note ? [`备注：${note}`] : []),
          ...(badLocation ? [`⚠ ${locationHint}`] : []),
          ...cards
            .map((s: any) => clashIndex.get(clashKey(o.id, s.id))?.[0])
            .filter(Boolean)
            .map(
              (cl: any) =>
                `⚠ 冲突：${cards.find((s: any) => s.id === cl.resourceId)?.holder_name ?? "有个资源"} 在 ${cl.days.join("、")} 同时配给了「${orderNameById.get(cl.otherOrderId) ?? "另一单"}」`
            ),
          ...cards.map(
            (s: any) =>
              `　${s.holder_gender === "male" ? "♂" : "♀"} ${s.holder_name}（${calcAge(s.holder_date_of_birth) ?? "?"}岁 ${s.item_type ?? ""}）`
          ),
        ].join("\n");

        if (showEdit) {
          instantEditors[o.id] = {
            orderId: o.id,
            orderStart: orderStartDay(o) ?? "",
            // 从普通态那份派生：位置和颜色同 blockStyle，边框光圈换成分配态的
            style: {
              gridRow: blockStyle.gridRow,
              gridColumn: blockStyle.gridColumn,
              background: blockStyle.background,
              color: blockStyle.color,
              ...orderFrame({ statusBorder: c.border, adminColor: providerColor, innerColor, assigning: true }),
            },
            resizable: runFullyInBand
              ? { runStart: run[0], runEnd: run[run.length - 1], startIndex: start, length: seg.length, laneRow: bandLane + 2 }
              : null,
            title: blockTitle,
            customerName: displayName(o.customers, ""),
            location: o.location ?? "",
            locationHint,
            badLocation,
            status: o.status,
            note,
            amount: o.amount ?? null,
            maleCount: o.male_count,
            femaleCount: o.female_count,
            need: {
              maleFilled: need.maleFilled,
              femaleFilled: need.femaleFilled,
              maleGap: need.maleGap,
              femaleGap: need.femaleGap,
            },
            cards: cards.map((s: any) => ({
              id: s.id,
              label: holderLabels.get(s.holder_name ?? "") ?? s.holder_name,
              clash: Boolean(clashIndex.get(clashKey(o.id, s.id))),
              gender: s.holder_gender ?? null,
            })),
            cardBg: c.bg,
            cardBorder: c.border,
            adminId: orderAdminId,
            band: bandIdx,
          };
        }

        band.blocks.push({
          key: segKey,
          d: {
            orderId: o.id,
            orderStart: orderStartDay(o) ?? "",
            href: p.hrefFor(o.id),
            gridRow: blockStyle.gridRow,
            gridColumn: blockStyle.gridColumn,
            status: o.status,
            adminColor: providerColor,
            innerColor,
            title: blockTitle,
            label: [displayName(o.customers), o.location].filter(Boolean).join(" · "),
            showDetail,
            editSeg: showEdit,
            customerName: displayName(o.customers),
            customerId: o.customer_id ?? null,
            location: o.location ?? null,
            locationHint,
            badLocation,
            note,
            amount: o.amount ?? null,
            need: {
              maleNeeded: need.maleNeeded,
              femaleNeeded: need.femaleNeeded,
              maleFilled: need.maleFilled,
              femaleFilled: need.femaleFilled,
              isComplete: need.isComplete,
            },
            // 只有放摘要的那一段才画资源
            cards: showDetail
              ? cards.map((s: any) => {
                  const clash = clashIndex.get(clashKey(o.id, s.id));
                  return {
                    id: s.id,
                    label: holderLabels.get(s.holder_name ?? "") ?? s.holder_name,
                    clashTitle: clash
                      ? `⚠ ${s.holder_name} 在 ${clash[0].days.join("、")} 同时配给了「${orderNameById.get(clash[0].otherOrderId) ?? "另一单"}」`
                      : "",
                  };
                })
              : [],
          },
        });
      }
    }
  });

  return {
    noteByDay,
    modeResources,
    resources,
    hasFilter,
    resourceTotal,
    assignedTo,
    bookedDays,
    bookingsByResource,
    usesByResource,
    assignHistory,
    withDays,
    timeline,
    hiddenBeforeStart,
    bands,
    stats,
    panelOrders,
    instantEditors,
  };
}

export type OverviewModel = ReturnType<typeof buildOverview>;
