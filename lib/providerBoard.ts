import { assignBlockReason } from "./assignable";
import { matchesLocationFilter } from "./locations";
import { computeNeed, formatGap } from "./assignment";
import { contiguousRuns, formatDayRanges } from "./dates";
import { formatParty } from "./party";

/**
 * 物主那张日历的模型层。React 一行都没有，方便单测。
 *
 * **一个块一个单子**，跟排期总览和匹配台同一个排法。原来是「一行一个资源」——
 * 两个资源就是两行并排的日历，同一单能被两个资源接就在两行里各画一遍，
 * 越多资源越乱，而物主要看的本来就是「有哪些单」，不是「我的资源长什么样」。
 * 现在点一个单子，下面再问「用哪个资源接」—— 选资源是提意向那一步的事，
 * 不该拿整张日历的纵轴去表达。
 *
 * **这不是 admin 排期总览的复用。** 两张日历看起来像，喂的数据完全不同：
 * admin 那张块上写着客户姓名和金额；物主这张一个字的客户信息都没有。
 * 物主看不到客户是谁，跟客户看不到持有人是谁对称 —— 直接把 admin 那张搬过来
 * 就把这条作废了，所以是另写一层，不是加个 readonly 开关。
 *
 * 列宽也是另一个数：admin 的 COL_WIDTH=180 是为了在块里塞下姓名·地点·状态·备注·金额，
 * 物主这边块上只有地点和缺口，180 全是空的。这不是「第二份同一个数」，是两个数。
 */
export const PROVIDER_COL_WIDTH = 56;
export const PROVIDER_COL_GAP = 2;
/** 窗口最多铺这么多天 —— 再长横着滚不完，也没人排那么远 */
export const PROVIDER_MAX_DAYS = 120;

/**
 * 物主这张日历只看**今天往前两周、往后四周**。设置里的「从哪天开始」也只能在
 * 这个范围里挑 —— 不是默认值而是硬边界。
 *
 * 为什么资源他：物主要做的决定只有一个「这单我接不接」，而能接的单都在眼前这几周。
 * 库里有一张 11 月的单，日历就得从 9 月一路铺到 11 月，中间四十多天全是空的 ——
 * 空格子把真有东西的那两周挤得没法看（admin 那张不资源，他要排整个季）。
 * 窗口外还有几单不会藏着不说，日历下面写一句。
 */
export const PROVIDER_WINDOW_BACK_DAYS = 14;
/**
 * 27 不是 28：**今天自己算一格**。往后四周 = 从今天起 28 天，末尾那天是 今天+27。
 * 写 28 的话一共 29 格，每行 14 天就切成 14 + 14 + 1 —— 最后孤零零一格单开一带子。
 */
export const PROVIDER_WINDOW_AHEAD_DAYS = 27;

export function providerWindowBounds(today: string): { from: string; to: string } {
  return {
    from: shiftDay(today, -PROVIDER_WINDOW_BACK_DAYS),
    to: shiftDay(today, PROVIDER_WINDOW_AHEAD_DAYS),
  };
}

/**
 * 每行排几天。排不下的日子**换到下一行**，不是横着滚出去 —— 跟 admin 排期总览
 * 一个道理（见 lib/bandDays.ts 开头那段）。
 *
 * 默认两周：56px 一列，14 天约 810px，笔记本一屏放得下。手机上调到 7，
 * 桌面宽屏可以拉到 42。**这个数是「这台机器上我习惯怎么看」，所以存 cookie
 * 不存库** —— 跟缩放、面板宽度同一类，换台机器重新调一次就是了。
 */
export const PROVIDER_BAND_DAYS_DEFAULT = 14;
export const PROVIDER_BAND_DAYS_MIN = 7;
export const PROVIDER_BAND_DAYS_MAX = 42;

export function clampProviderBandDays(days: unknown): number {
  // **类型先挡**：Number("") 和 Number(null) 都是 0，能过 isFinite，
  // 然后被夹成最窄的 7 天悄悄存进去 —— 「没设过」会看着像「设成了最窄」。
  // admin 那条设置路上栽过同一个坑，注释还在 app/admin/settings/route.ts 里。
  const n =
    typeof days === "number"
      ? days
      : typeof days === "string" && days.trim() !== ""
        ? Number(days)
        : NaN;
  if (!Number.isFinite(n)) return PROVIDER_BAND_DAYS_DEFAULT;
  return Math.min(PROVIDER_BAND_DAYS_MAX, Math.max(PROVIDER_BAND_DAYS_MIN, Math.floor(n)));
}
/** 今天往前留几天：最近排出去的活儿还看得见，有个上下文 */
const LOOKBACK_DAYS = 3;

/** 这一单我的哪个资源接得了 —— 点完块就在这几张里挑一张提意向 */
export type ProviderFit = {
  resourceId: string;
  holderName: string;
  /** 这个资源对这一单已经提过了，再提没意义 */
  proposed: boolean;
};

export type ProviderBlock = {
  /** 已排块没有 orderId（那是我自己的占用，不是能接的单） */
  orderId: string;
  /** 已排块是哪个资源占着的。候选块看 fits，这里是空的 */
  resourceId: string;
  startIndex: number;
  length: number;
  /** 块上第一行：地点。已排块写「已排」 */
  location: string;
  /** 库里那个原始值，只拿来筛 —— 上面那个是给人看的（空的时候写「未填地点」） */
  locationKey: string | null;
  /** 块上第二行：还差几个资源。已排块写持有人名字 */
  gap: string;
  title: string;
  kind: "booked" | "candidate";
  fits: ProviderFit[];
  /** 能接的资源都已经提过了 —— 块上标一下，点进去也没得选 */
  proposed: boolean;
};

/** 日历下面那条清单的一项：一个资源 × 一单，不按连续段拆 */
export type ProviderCandidate = {
  orderId: string;
  resourceId: string;
  /** 筛地点用，跟块上那个是同一个原始值 */
  locationKey: string | null;
  /** 排序和显示都用它 —— 这一单最早的那天 */
  firstDay: string;
  label: string;
  title: string;
  proposed: boolean;
};

export type ProviderBoard = {
  days: string[];
  /** 互不重叠的挤一条道，重叠的往下排 —— 跟排期总览一个排法 */
  lanes: ProviderBlock[][];
  /**
   * 跟日历上画的是同一批候选，只是摊平成一条清单。
   *
   * 为什么两份都要：日历回答「我的资源什么时候空着」，清单回答「现在有哪些能接」。
   * 手机上一屏只看得到五六天，光有日历的话，一个月后那单得横着滚半天才够得到 ——
   * 物主大概率就是在手机上看的。**不是第二份数据**：两边都从 lanes 这一份算出来。
   */
  candidates: ProviderCandidate[];
  /** 有多少单是「有资源能接」的（去重），用来写一句概览 */
  candidateOrderCount: number;
  /** 其中有几单落在窗口外（四周之后）—— 日历上画不出来，得用一句话交代 */
  outsideWindowCount: number;
};

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * 日历铺哪几天。
 *
 * 起点是「今天往前 3 天」和「最早要显示的那天」里靠后的那个 —— 往前留一点上下文，
 * 但不会因为库里有一张去年的排期就把日历拉出去半年。终点跟着最晚那天走，封顶 120 天。
 *
 * @param explicitStart 界面上指定了起始日就**原样用**，不再往前留那 3 天 ——
 *   说从这天开始就从这天开始，不然「我明明填了 12/1 怎么显示 11/28」很莫名。
 *   （跟 admin 的 resolveTimelineStart 同一条规矩。）
 * @param bounds 硬边界，两头都夹住，**指定的起始日也夹**。物主那张传
 *   `providerWindowBounds(today)`；**admin 那两张不传** —— 匹配台要排整个季，
 *   夹住它等于把远处的单子藏起来。
 */
export function buildDayWindow(
  today: string,
  marks: string[],
  explicitStart?: string,
  bounds?: { from: string; to: string }
): string[] {
  // **先把界外的日子扔掉再算两头。** 拿界外的日子算终点的话，日历会一路铺到
  // 上界，末尾拖出一条十几天全空的带子 —— 那几天什么都没有，正是因为唯一落在
  // 那儿的单子已经被窗口挡掉了
  const all = [...new Set(marks)].sort();
  const sorted = bounds ? all.filter((d) => d >= bounds.from && d <= bounds.to) : all;
  if (sorted.length === 0) return [];
  const lookback = shiftDay(today, -LOOKBACK_DAYS);
  const auto = sorted[0] > lookback ? sorted[0] : lookback;
  let start = explicitStart || auto;
  const last = sorted[sorted.length - 1];
  if (bounds) {
    if (start < bounds.from) start = bounds.from;
    if (start > bounds.to) start = bounds.to;
  }
  const days: string[] = [];
  for (let d = start; d <= last && days.length < PROVIDER_MAX_DAYS; d = shiftDay(d, 1)) {
    days.push(d);
  }
  return days;
}

/**
 * 贪心打包：重叠的块分到不同的条上，不重叠的挤在同一条。
 * 按开始时间排，每个块放进第一条放得下的。
 *
 * 为什么需要：同一个周末常常有好几单都落在这个资源的空档里，画在一条上会叠成一团。
 */
export function packLanes<T extends { startIndex: number; length: number }>(
  blocks: T[]
): T[][] {
  const sorted = [...blocks].sort(
    (a, b) => a.startIndex - b.startIndex || a.length - b.length
  );
  const lanes: T[][] = [];
  const laneEnd: number[] = []; // 每条已经占到哪个下标（不含）
  for (const b of sorted) {
    let i = lanes.findIndex((_, n) => laneEnd[n] <= b.startIndex);
    if (i === -1) {
      i = lanes.length;
      lanes.push([]);
      laneEnd.push(0);
    }
    lanes[i].push(b);
    laneEnd[i] = b.startIndex + b.length;
  }
  return lanes;
}

/** 分带之后的一段。整张日历只有一组泳道，所以包成一个「行」丢进 splitBoardIntoBands */
export type ProviderBandRow = { booked: ProviderBlock[]; lanes: ProviderBlock[][] };
export type ProviderBand = {
  days: string[];
  rows: ProviderBandRow[];
};

/**
 * 最后一带不够一整行的话，**用空日子补齐**。
 *
 * 不补的话最后一带是半截的：右边缺一块，整张表看着像被啃了一口。补出来的那几天
 * 本来就什么都没有（有东西的话窗口早就铺到那儿了），画出来就是几个空格子 ——
 * 代价只是几列空白，换来一张完整的方表。
 *
 * @param maxDay 有上界就不越过它（物主那张只看到今天+27，补过头等于偷偷放宽窗口）。
 *   admin 那张不传，补齐就是了。
 */
export function padDaysToFullBands(days: string[], bandDays: number, maxDay?: string): string[] {
  const n = clampProviderBandDays(bandDays);
  if (days.length === 0) return days;
  const short = days.length % n;
  if (short === 0) return days;

  const out = [...days];
  for (let i = 0; i < n - short; i++) {
    const next = shiftDay(out[out.length - 1], 1);
    if (maxDay && next > maxDay) break;
    out.push(next);
  }
  return out;
}

/**
 * 把整条时间轴切成每行 n 天。跨着接缝的块在上下两行各画一截 ——
 * 渲染那边本来就是按段切的，这里只是再切一刀。
 *
 * 泛型：块的类型由调用方定 —— 物主那张日历和匹配台那张画的东西不一样
 * （一个是「我能接的需求」，一个是「有人想拿这个资源接的单」），但**几何是同一套**。
 * 两边各写一份分带和排道，就是第二份数字和第二份样式那条。
 *
 * **空掉的 lane 压掉，相对顺序不动。** 一开始想的是「lane 编号跨行保持不变」，
 * 免得同一单在行与行之间上下跳；实际画出来才发现这条更糟 —— 某一行前面几条
 * lane 全空的时候，块会悬在行底、上面空一大截，看着像渲染错了。
 * 压掉之后块贴着行顶排，相对顺序还在（本来就在同一条 lane 上的仍然在同一条），
 * 跨行的单最多往上挪一格，而上下两行本来就隔着老远，那点位移看不出来。
 */
export function splitBoardIntoBands<
  B extends { startIndex: number; length: number },
  R extends { booked: B[]; lanes: B[][] },
>(board: { days: string[]; rows: R[] }, bandDays: number): { days: string[]; rows: R[] }[] {
  const n = clampProviderBandDays(bandDays);
  const bands: { days: string[]; rows: R[] }[] = [];

  for (let from = 0; from < board.days.length; from += n) {
    const to = Math.min(from + n, board.days.length);
    const clip = (b: B): B | null => {
      const start = Math.max(b.startIndex, from);
      const end = Math.min(b.startIndex + b.length, to);
      if (end <= start) return null;
      return { ...b, startIndex: start - from, length: end - start };
    };

    bands.push({
      days: board.days.slice(from, to),
      rows: board.rows.map((row) => {
        const lanes = row.lanes
          .map((lane) => lane.map(clip).filter((b): b is B => b !== null))
          .filter((lane) => lane.length > 0);
        return {
          ...row,
          booked: row.booked.map(clip).filter((b): b is B => b !== null),
          lanes,
        };
      }),
    });
  }

  return bands;
}

type Resource = {
  id: string;
  status?: string | null;
  holder_name?: string | null;
  holder_gender?: string | null;
  item_type?: string | null;
  // 有效期（datemultirange 文本），读法见 lib/validity.ts
  validity?: unknown;
};

type Order = {
  id: string;
  location?: string | null;
  demand_days?: string[] | null;
  male_count?: number | null;
  female_count?: number | null;
};

/**
 * 把一堆日子切成连续段，再换算成日历上的块。
 * 不连续的需求（只用 24、25、27）会画成分开的两截，跟 admin 那张一个道理。
 */
function runsToBlocks(
  days: string[],
  indexOf: Map<string, number>,
  make: (run: string[], startIndex: number) => Omit<ProviderBlock, "startIndex" | "length">
): ProviderBlock[] {
  const blocks: ProviderBlock[] = [];
  for (const run of contiguousRuns(days)) {
    // 窗口封了顶，落在窗口外的段整段跳过
    const visible = run.filter((d) => indexOf.has(d));
    if (visible.length === 0) continue;
    const startIndex = indexOf.get(visible[0])!;
    blocks.push({
      ...make(visible, startIndex),
      startIndex,
      length: visible.length,
    });
  }
  return blocks;
}

/**
 * 物主这边还看得见的需求：整单都在今天之前的扔掉 —— 他再也接不了了，
 * 列出来只会占地方。（管理员那边照样看得见，补录历史单是他的活儿。）
 *
 * 日历和「还没挂资源时的那条预告」共用这一条，不然两处会给出不一样的单数，
 * 挂完资源发现「刚才说有 12 单，怎么现在数不对」。
 */
export function actionableOrders<T extends { demand_days?: string[] | null }>(
  orders: T[],
  today: string
): T[] {
  return orders.filter((o) => {
    const days = o.demand_days ?? [];
    return days.length > 0 && days.some((d) => d >= today);
  });
}

export function buildProviderBoard(input: {
  today: string;
  resources: Resource[];
  orders: Order[];
  /** orderId -> 这一单已经配上的资源（判断还差男资源还是女资源） */
  assignedByOrder: Map<string, { id?: string; holder_gender?: string | null }[]>;
  /** resourceId -> 这个资源已经被占掉的日子 */
  bookedByResource: Map<string, string[]>;
  /** 已经提过意向的 `${orderId}:${resourceId}` */
  proposed: Set<string>;
  /** 界面上指定的起始日，没指定就按默认算 */
  start?: string;
}): ProviderBoard {
  const { today, resources, orders, assignedByOrder, bookedByResource, proposed } = input;

  // 先算出每个资源能接哪些单 —— 用的是分配那一份校验（lib/assignable.ts），
  // 界面上列出来的和管理员真去配的时候放行的，必须是同一套判断，
  // 否则物主提了一堆管理员根本配不上的意向
  const actionable = actionableOrders(orders, today);

  // 反过来按单收：一单我有几个资源能接，是点开之后要挑的那几张
  const fitsByOrder = new Map<string, ProviderFit[]>();
  for (const s of resources) {
    const booked = bookedByResource.get(s.id) ?? [];
    for (const o of actionable) {
      if ((o.demand_days ?? []).length === 0) continue;
      const blocked = assignBlockReason({
        order: o,
        resource: s,
        alreadyAssigned: assignedByOrder.get(o.id) ?? [],
        resourceBookedDays: booked,
      });
      if (blocked) continue;
      fitsByOrder.set(o.id, [
        ...(fitsByOrder.get(o.id) ?? []),
        {
          resourceId: s.id,
          holderName: s.holder_name ?? "?",
          proposed: proposed.has(`${o.id}:${s.id}`),
        },
      ]);
    }
  }

  const fittingOrders = actionable.filter((o) => fitsByOrder.has(o.id));

  const marks = [
    ...resources.flatMap((s) => bookedByResource.get(s.id) ?? []),
    ...fittingOrders.flatMap((o) => o.demand_days ?? []),
  ];
  const days = buildDayWindow(today, marks, input.start, providerWindowBounds(today));
  const indexOf = new Map(days.map((d, i) => [d, i]));

  // 已经排出去的日子也画在同一张日历上 —— 它们不是「能接的单」，但正是
  // 「这几天我接不了」的原因。分成两张表的话，物主得自己在两张之间对日期
  const booked = resources.flatMap((s) =>
    runsToBlocks(bookedByResource.get(s.id) ?? [], indexOf, (run) => ({
      orderId: "",
      resourceId: s.id,
      kind: "booked" as const,
      location: "已排",
      // 已排是我自己的占用，跟筛哪个地点无关 —— null 的块筛的时候一律留着
      locationKey: null,
      gap: s.holder_name ?? "?",
      title: `${s.holder_name ?? "这个资源"}已排 ${formatDayRanges(run)}（${run.length}天）`,
      fits: [],
      proposed: false,
    }))
  );

  const described = fittingOrders.map((o) => ({
    order: o,
    fits: fitsByOrder.get(o.id) ?? [],
    ...describeOrder(o, assignedByOrder.get(o.id) ?? []),
  }));

  const candidates = described.flatMap((d) =>
    runsToBlocks(d.order.demand_days ?? [], indexOf, () => ({
      orderId: d.order.id,
      resourceId: "",
      kind: "candidate" as const,
      location: d.location,
      locationKey: d.order.location ?? null,
      gap: d.gap,
      title: d.title,
      fits: d.fits,
      proposed: d.fits.every((f) => f.proposed),
    }))
  );

  const lanes = packLanes([...booked, ...candidates]);

  // 清单**不跟着窗口走**：日历只画这几周（见 PROVIDER_WINDOW_* 那段），
  // 但「我一共有几单能接」不该因此少报。窗口外那几单在日历下面用一句话交代，
  // 数量就是这两个的差
  const inWindow = new Set(candidates.map((b) => b.orderId));

  // 清单仍然是「一个资源 × 一单」：点进去就是拿那个资源提，省掉再挑一次。
  // 一单被切成几段的（只用 24、25、27）在日历上是几个块，这里只算一条
  const list: ProviderCandidate[] = [];
  for (const d of described) {
    const firstDay = [...(d.order.demand_days ?? [])].sort()[0] ?? "";
    for (const f of d.fits) {
      list.push({
        orderId: d.order.id,
        resourceId: f.resourceId,
        locationKey: d.order.location ?? null,
        firstDay,
        label: [d.location, d.gap].filter(Boolean).join(" · "),
        title: d.title,
        proposed: f.proposed,
      });
    }
  }
  list.sort((a, b) => (a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : 0));

  return {
    days,
    lanes,
    candidates: list,
    candidateOrderCount: fittingOrders.length,
    outsideWindowCount: fittingOrders.filter((o) => !inWindow.has(o.id)).length,
  };
}

/**
 * 收窄：哪个资源、哪个区域 / 地点。**服务端只算一次全量的盘子，这几个开关在界面上
 * 当场切** —— 每个都要等一次整页渲染（这一页 1.5 秒起）实在太亏，而收窄需要的
 * 东西盘子里全有：候选块身上挂着哪几个资源接得了、是哪个地点，已排块身上挂着是哪个资源。
 *
 * 放在 lib 里而不是组件里：它是「怎么算」不是「怎么画」，而且这么一来能单测 ——
 * **收窄的结果必须跟「服务端直接按这个条件算一遍」画出同一批块**。
 *
 * 已排的块不受地点的筛选影响：那是「这几天我接不了」的原因，跟你在看哪个地点无关。
 * 按地点筛掉的话日历上会凭空空出几天，看着像资源空着其实是被占着的。
 */
export function filterBoardByCard(
  board: ProviderBoard,
  resourceId: string,
  location?: { region?: string | null; mtn?: string | null }
): ProviderBoard {
  const fitsLocation = (key: string | null) =>
    !location || matchesLocationFilter(key, location);

  const blocks = board.lanes.flat();
  const kept = blocks.flatMap((b) => {
    if (b.kind === "booked") return !resourceId || b.resourceId === resourceId ? [b] : [];
    if (!fitsLocation(b.locationKey)) return [];
    if (!resourceId) return [b];
    const fits = b.fits.filter((f) => f.resourceId === resourceId);
    if (fits.length === 0) return [];
    return [{ ...b, fits, proposed: fits.every((f) => f.proposed) }];
  });

  const candidates = board.candidates.filter(
    (c) => (!resourceId || c.resourceId === resourceId) && fitsLocation(c.locationKey)
  );

  // 窗口外那几单：清单里有、日历上没有的那些（清单不跟着窗口走）
  const drawn = new Set(kept.filter((b) => b.kind === "candidate").map((b) => b.orderId));
  const all = new Set(candidates.map((c) => c.orderId));

  return {
    days: board.days,
    lanes: packLanes(kept),
    candidates,
    candidateOrderCount: all.size,
    outsideWindowCount: [...all].filter((id) => !drawn.has(id)).length,
  };
}

/**
 * 还没挂资源时给他看的那张日历：**全部在找资源的单**，一个都点不了。
 *
 * 为什么也走日历：空页面劝不动人，一屏需求才劝得动，而摊在时间轴上比列六行字
 * 更像「这几周有多少活儿」。**但不能让他以为这些他都能接** —— 现在没有资源，
 * 性别 / 有效期 / 类型一条都筛不了，所以块上一个 fit 都没有，点不动，
 * 上面那句文案把口径说清楚。
 */
export function buildPreviewBoard(input: {
  today: string;
  orders: Order[];
  /** 配了一半的单子要写清楚还差什么 —— 跟挂了资源之后看到的是同一句话 */
  assignedByOrder?: Map<string, { holder_gender?: string | null }[]>;
  start?: string;
}): ProviderBoard {
  const { today, orders, assignedByOrder } = input;
  const actionable = actionableOrders(orders, today);
  const days = buildDayWindow(
    today,
    actionable.flatMap((o) => o.demand_days ?? []),
    input.start,
    providerWindowBounds(today)
  );
  const indexOf = new Map(days.map((d, i) => [d, i]));

  const blocks = actionable.flatMap((o) => {
    const d = describeOrder(o, assignedByOrder?.get(o.id) ?? []);
    return runsToBlocks(o.demand_days ?? [], indexOf, () => ({
      orderId: o.id,
      resourceId: "",
      kind: "candidate" as const,
      location: d.location,
      locationKey: o.location ?? null,
      gap: d.gap,
      title: d.title,
      // 一个资源都没有 = 一个都接不了，块只是给他看看
      fits: [],
      proposed: false,
    }));
  });

  const inWindow = new Set(blocks.map((b) => b.orderId));
  return {
    days,
    lanes: packLanes(blocks),
    candidates: [],
    candidateOrderCount: actionable.length,
    outsideWindowCount: actionable.filter((o) => !inWindow.has(o.id)).length,
  };
}

/**
 * 一单怎么写在界面上 —— 块上两行、清单一行、hover 的 title，全从这一份来。
 *
 * **title 只描述这一单**，不写「几个资源接得了」「已经提过了」那种状态：状态由块的
 * 样式和浮层说，写进 title 的话清单里每行都要跟右边的「用 xxx」「已提意向」重复。
 * 刻意没有客户姓名，也没有金额 —— 金额是客户付给平台的总价，不是物主拿的钱。
 */
function describeOrder(
  o: Order,
  assigned: { holder_gender?: string | null }[]
): { location: string; gap: string; title: string } {
  // 人数一个都没填的老单子（库里还有几条）：算出来的缺口是「已配齐」，
  // 摆在一张「还在找资源」的日历上自相矛盾。照实说没填，别让它冒充配好了的
  const headcount = (o.male_count ?? 0) + (o.female_count ?? 0);
  const gap = headcount === 0 ? "人数没填" : formatGap(computeNeed(o, assigned));
  return {
    location: o.location || "未填地点",
    gap,
    title: [
      formatDayRanges(o.demand_days ?? []),
      `${(o.demand_days ?? []).length}天`,
      o.location || "没填地点",
      formatParty(o.male_count, o.female_count),
      gap,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
