import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import ClickOutsideDeselect from "./ClickOutsideDeselect";
import ZoomableCalendar from "./ZoomableCalendar";
import ResizableOrderBlock from "./ResizableOrderBlock";
import OptimisticEditForm from "./OptimisticEditForm";
import NewOrderSelector from "./NewOrderSelector";
import AssigningBar from "./AssigningBar";
import DragAssign from "./DragAssign";
import OptimisticAssign from "./OptimisticAssign";
import FilterForm from "@/app/admin/orders/FilterForm";
import PanelScroller from "./PanelScroller";
import CollapsibleResourcePanel from "./CollapsibleResourcePanel";
import CollapsibleFilters from "./CollapsibleFilters";
import SortMenu from "./SortMenu";
import BulkSelect from "./BulkSelect";
import CardsRowScroll from "./CardsRowScroll";
import { AssignResourceButton, UnassignButton } from "./AssignActions";
import { cookies } from "next/headers";
import { formatParty } from "@/lib/party";
import { calcAge } from "@/lib/age";
import {
  compareResources,
  parseResourceSort,
  RESOURCE_SORTS,
  DEFAULT_RESOURCE_SORT,
  type ResourceSort,
} from "@/lib/resourceSort";
import {
  dateRangeToArray,
  isWeekend,
  todayIso,
  shortLabel,
  contiguousRuns,
  formatDayRanges,
} from "@/lib/dates";
import { isPeakDate } from "@/lib/peakDates";
import { COL_WIDTH, clampRailWidth } from "@/lib/bandDays";
import { shortHolderNames } from "@/lib/holderName";
import { resolveTimelineStart, ordersBeforeStart } from "@/lib/timelineStart";
import { previousOrdersFor, type ResourceUse } from "@/lib/previousUse";
import { findClashes, indexClashes, clashKey } from "@/lib/doubleBooking";
import { getOverviewStart, getOverviewBandDays } from "@/lib/appSettings";
import DayNote from "./DayNote";
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
import { statusColor, statusOptions, STATUS_LABELS } from "@/lib/orderStatus";
import {
  computeNeed,
  formatNeed,
  formatGap,
} from "@/lib/assignment";
import {
  LOCATION_OPTIONS,
  REGION_LABELS,
  isUnknownLocation,
  locationHintFor,
  normalizeLocation,
  sameVenue,
  type Region,
} from "@/lib/locations";
import LocationInput from "@/components/LocationInput";
import {
  formatRun,
  sortChronologically,
  toBookingRuns,
  type Booking,
} from "@/lib/booking";
import {
  recommendResources,
  explain,
  type PastUse,
  type Scored,
} from "@/lib/recommend";
import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_LABELS,
  abnormalBadge,
  coversOrder,
  formatValidity,
  itemConflictReason,
} from "@/lib/resourceStatus";
import {
  pageTitleStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  linkButtonStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

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

// Chrome 123+ 的 field-sizing:content——输入框跟着内容宽窄走。
// 分配模式的「姓名 · 地点」靠它才能像平时状态那样紧挨着；否则两个 flex:1 的框
// 各占一半，名字短的时候中间空一大截，看着很散。
// TS 的 CSSProperties 还没收这个属性，所以断言一下；不支持的浏览器退回默认宽度，
// 只是没那么紧凑，不会坏。
const FIELD_SIZING_CONTENT = { fieldSizing: "content" } as React.CSSProperties;

// 第 3 行「男1/1」里分母那一格的尺寸。分配态那儿是个数字输入框，缩不到跟文字
// 一样窄（5px 宽点不中），所以反过来让**普通态也占同样的格子**——两个状态一样宽，
// 进出编辑那行就不动了。两边都用这一份，别各写各的。
/** 「男…」和「女…」两组之间的间距。两个状态共用，别一边写 gap 一边靠空格 */
// 「男…」和「女…」两组之间的间距。两个状态共用，别一边写 gap 一边靠空格。
// 2 → 1：分母那一格（COUNT_BOX）本来就只按一位数给，右边还有 1px 内边距，
// 加起来看着仍然偏空。人数不会到两位数（真有也是拆成几单），所以能收就收
const COUNT_GAP = 1;

// 右下角那个金额。两个状态共用：普通态是文字、分配态是输入框，
// 但**右边缘、字号、淡度、右对齐**必须一模一样，不然进出编辑钱会挪位置。
// 输入框默认左对齐，普通态的文字是右对齐的 —— 这一条不写就差七八像素。
const MONEY_SLOT: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.8,
  textAlign: "right",
  flexShrink: 0,
};

const COUNT_BOX: React.CSSProperties = {
  display: "inline-block",
  boxSizing: "content-box",
  // **按一位数给**，不给两位数留位置。原来是 16（够写「12」），可实测最宽的
  // 数字才 7.3px，两个性别加起来白占了 18px —— 一天的单子内宽只有 136px，
  // 这 18px 正好是状态下拉框能不能露出来的分水岭。
  // 人数到 10 的单子实际上不存在（真有也是拆成几单处理），为这种情况常年
  // 占着位置不划算。真填了两位数，两个状态都是一样地溢出，位置还是对得上的。
  width: 8,
  // 左右各 1px，不是 2px。两个格子省下 4px —— 听着像抠，但这 4px 就是余量本身：
  // 只留 8px 宽的时候整行正好卡死（本地量出来状态框拿到 39px、它要的也正好
  // 是 39px），CI 的 Linux 字体宽那么零点几，直接就破了（38.56 < 39）。
  // 零余量的布局等于没修好，只是在这台机器上碰巧成立
  // 左 1 右 0：右边那 1px 全落在「1」和「女」中间，纯粹是空的。
  // 左边留 1px 是不让数字贴死在「/」上
  padding: "0 0 0 1px",
  textAlign: "left",
};
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
// 一条时间轴拉到底横着能滑很久，改成每 4 周折一段往下排（跟 Excel 里那张排期表一个思路）。
// 段的起点对齐到周一，所以每段正好是 4 个完整自然周。
// 每行几天现在跟着右边那道帘子走（lib/bandWeeks.ts），不再是写死的。
// 帘子收着的时候就是 28 天 —— 原来的样子。
// 每段除了实际用到的泳道，底下再空几行：一是留位置拖拽建新单，二是跟下一段隔开
const EXTRA_LANES = 2;
// 最后一段底下留多一点：下面没有别的段接着了，往后加新单子都得在这儿拖
const EXTRA_LANES_LAST = 5;
// 段与段之间再补一点视觉间距，跟上面那几行空泳道加一起就是"隔几个单位"的效果
const BAND_GAP = 12;

async function createQuickOrder(formData: FormData) {
  "use server";
  const customerName = ((formData.get("customer_name") as string) ?? "").trim();
  if (!customerName) throw new Error("客人姓名不能为空");

  const location = ((formData.get("location") as string) ?? "").trim() || null;
  const note = ((formData.get("note") as string) ?? "").trim();
  const maleCount = Number(formData.get("male_count") ?? 0) || 0;
  const femaleCount = Number(formData.get("female_count") ?? 0) || 0;
  const demandDays = JSON.parse((formData.get("demand_days") as string) ?? "[]") as string[];
  if (demandDays.length === 0) throw new Error("日期不能为空");
  const amountRaw = ((formData.get("amount") as string) ?? "").trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);

  // Supabase 一个来回要 0.4~2 秒（实测原生 fetch 也一样慢，不是客户端库的锅，
  // 就是网络延迟），所以能少一次查询就少一次：客户端如果已经知道这个名字对应的
  // customer_id（页面加载时把 customers 一起查出来了），就直接带过来，跳过这次查询。
  const passedCustomerId = ((formData.get("customer_id") as string) ?? "").trim();

  let customerId = passedCustomerId || undefined;
  if (!customerId) {
    // 同名客人复用，找不到就现建一个 —— 快速建单不打断流程去 Customer 页面
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .ilike("first_name", customerName)
      .limit(1)
      .maybeSingle();
    customerId = existingCustomer?.id as string | undefined;
  }

  if (!customerId) {
    const { data: created, error: customerError } = await supabase
      .from("customers")
      .insert({ first_name: customerName })
      .select("id")
      .single();
    if (customerError) throw new Error(customerError.message);
    customerId = created.id;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      location,
      male_count: maleCount,
      female_count: femaleCount,
      demand_days: demandDays,
      amount,
      status: "created",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 备注存在 order_notes 里（表本来就有，跟 orders 一对一），不往 orders 上加字段。
  // 填了才写，多一次写库就多一个 Supabase 来回（0.4~2 秒），没填就别浪费这个时间。
  // 这一步失败不往上抛：订单其实已经建好了，抛上去客户端会显示"建单失败"，
  // 比丢一条备注更误导人——备注可以进分配模式重填。
  if (note) {
    await supabase.from("order_notes").insert({ order_id: order.id, internal_note: note });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  // 这里不 redirect：server action 里的 redirect 会顺带把跳转目标整页渲染完再返回，
  // 客户端得一路等着（实测 3~5 秒，全程卡在"建单中…"）。改成把新单子 id 还回去，
  // 让客户端自己跳——弹窗可以先关掉，不用对着按钮干等。
  return order.id as string;
}

// 拖色块边缘改日期原来在这儿（Server Action），已经挪到
// app/admin/overview/resize/route.ts —— 那条路上要拦「同一个资源同一天配两单」，
// 拦住时得把原因原样说给人听，而 Server Action 抛的错在生产环境会被换成
// 一句笼统的「服务器出错」。

async function deleteOrder(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;

  // order_assignments/payments/order_notes/matches 对 orders 都是 on delete cascade，
  // 删这一条订单会自动把它们清掉，不用手动一张张删
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/matches");
  // 同 createQuickOrder：不在这儿 redirect，那样会把跳转目标整页渲染完才返回，
  // 白等一个来回。跳转交给客户端，它点完就能立刻退出分配模式。
}

// 顶上那三个订单筛选（区域 / 地点 / 状态）共用一套尺寸 —— 宽度写死，
// 不让下拉框跟着最长选项撑开。同一个宽度只许有这一份（CLAUDE.md：
// 「第二份数字和第二份样式是同一个 bug」）。
// 110px 是量出来的：最长的那条默认值「RegionE」在 12px 下约 70px，
// 加箭头和内边距还剩十几 px 余量 —— 留够余量，不是「刚好够」。
const FILTER_SELECT_WIDTH = 110;
const filterSelectStyle: React.CSSProperties = {
  ...selectStyle,
  fontSize: 12,
  padding: "2px 4px",
  width: FILTER_SELECT_WIDTH,
  // 选项比框长的时候（地点的全称）截断，别把框顶开
  textOverflow: "ellipsis",
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: {
    item?: string;
    gender?: string;
    sstatus?: string;
    q?: string;
    assign?: string;
    allcards?: string;
    region?: string;
    mtn?: string;
    ostatus?: string;
    sregion?: string;
    smtn?: string;
    ssort?: string;
  };
}) {
  const [
    { data: orders, error },
    { data: allResources, error: resourceError },
    { data: assignments },
    { data: allCustomers },
    { data: orderNotes },
    { data: dayNotes },
    overviewStart,
    bandDaysSetting,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        // customer_id / 生日是推荐分配要用的：认「这个客人以前用的哪个资源」和年龄
        "id, customer_id, location, amount, status, demand_days, male_count, female_count, customers(first_name, last_name, date_of_birth)"
      ),
    supabase
      .from("resources")
      .select(
        // provider_id 是推荐要用的：同一单的两个资源如果同一个物主，取还跑一趟就够
        "id, provider_id, holder_name, holder_gender, holder_date_of_birth, item_type, date_range_start, date_range_end, status"
      )
      .order("date_range_start", { ascending: true }),
    supabase.from("order_assignments").select("order_id, resource_id"),
    // 建新单时用来在客户端直接把姓名换成 customer_id，省掉建单时的那次查询
    // （跟上面几条并行，不额外增加页面加载时间）
    supabase.from("customers").select("id, first_name"),
    supabase.from("order_notes").select("order_id, internal_note"),
    // 日期条上「这一天的备注」。整张表拉下来：一天一行，一个季撑死两三百行
    supabase.from("day_notes").select("day, note"),
    // 日历从哪天开始。**跟上面几条并排跑**，不要单独 await 一次 ——
    // 这一页渲染一次本来就要 0.6~1.3 秒，再串一个来回纯属白等
    getOverviewStart(),
    getOverviewBandDays(),
  ]);

  const noteByDay = new Map<string, string>(
    (dayNotes ?? []).map((n: any) => [n.day, n.note])
  );

  // 订单备注：色块右上角显示用。internal_note 这一列里还混着「取消原因」写进去的
  // JSON 信封（那个功能的代码没了，数据还在），统一走 readNoteText 拆一层，
  // 别把整段 JSON 印到色块上
  const noteByOrder = new Map<string, string>();
  for (const n of orderNotes ?? []) {
    const t = readNoteText(n.internal_note);
    if (t) noteByOrder.set(n.order_id, t);
  }

  // 姓名统一转小写当 key：原来服务端用的是 ilike，大小写不敏感，这里保持一致
  const customerIdByName: Record<string, string> = {};
  for (const r of allCustomers ?? []) {
    const key = (r.first_name ?? "").trim().toLowerCase();
    if (key && !customerIdByName[key]) customerIdByName[key] = r.id;
  }

  const resourceById = new Map((allResources ?? []).map((s: any) => [s.id, s]));
  const orderById = new Map((orders ?? []).map((o: any) => [o.id, o]));

  const assignedTo = new Map<string, any[]>();
  // 每个资源被订单占用了哪几天 —— 用来在卡片上显示「已排 9/10~9/12」
  const bookedDays = new Map<string, string[]>();

  for (const a of assignments ?? []) {
    const s = resourceById.get(a.resource_id);
    if (!s) continue;
    assignedTo.set(a.order_id, [...(assignedTo.get(a.order_id) ?? []), s]);

    const o: any = orderById.get(a.order_id);
    if (o?.demand_days?.length) {
      bookedDays.set(a.resource_id, [
        ...(bookedDays.get(a.resource_id) ?? []),
        ...o.demand_days,
      ]);
    }
  }

  // 推荐分配要看的历史：每个资源以前被配给过哪些单、那些单去了哪、走到哪一步了。
  // 这些数据上面已经查出来了，这里只是换个形状，不额外查库。
  // 资源清单那行「已排 …」要按订单分组显示（哪几天去哪个地点），
  // 跟 bookedDays 那个并集不是一回事：并起来就丢了「哪几天去哪」
  const bookingsByResource = new Map<string, Booking[]>();
  const usesByResource = new Map<string, ResourceUse[]>();
  const assignHistory: PastUse[] = [];
  for (const a of assignments ?? []) {
    const o: any = orderById.get(a.order_id);
    if (!o) continue;
    bookingsByResource.set(a.resource_id, [
      ...(bookingsByResource.get(a.resource_id) ?? []),
      { days: o.demand_days ?? [], location: o.location ?? null },
    ]);
    // 跟 bookingsByResource 几乎一样，多带一个 orderId —— 分配时要顺着它找回
    // 「这个资源上一单是哪一单」，好把那一单点亮
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

  // 每个资源上一次去的是哪一片区域 —— 左边按这个筛，就能只挑「一直在这一片用」的资源。
  // 取的是**最近一次**（按结束日期最大），跟卡片上「已排 …」那一行默认停在最右边
  // 是同一个意思：最近去哪对配下一单最有参考价值。
  // 认不出地点名的那几段跳过，不能因为写错一个名字就让整个资源归错区。
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
  // 挂牌状态默认只看「出租中」——暂停和已下架的平时不该占地方
  const f = {
    item: searchParams.item ?? "",
    gender: searchParams.gender ?? "",
    sstatus: searchParams.sstatus || "active",
    q: (searchParams.q ?? "").trim().toLowerCase(),
    // 上次去的区域 / 具体的地点。"none" 是「只看还没排过的」那一档
    sregion: searchParams.sregion ?? "",
    smtn: searchParams.smtn ?? "",
  };
  const sortBy = parseResourceSort(searchParams.ssort);
  // 色块里那行「已配的资源」显示成什么：默认只写 first name，撞名的才往后补姓氏字母。
  // **用 allResources 而不是筛选后的 resources**：左边面板筛掉几个资源，不该让
  // 日历上某个人的名字突然从「admin1C」变回「admin1」—— 撞名这件事跟筛选无关
  const holderLabels = shortHolderNames(
    (allResources ?? []).map((s: any) => s.holder_name ?? "")
  );

  const resources = (allResources ?? []).filter((s: any) => {
    if (f.item && s.item_type !== f.item) return false;
    if (f.gender && s.holder_gender !== f.gender) return false;
    if (f.sstatus !== "all" && s.status !== f.sstatus) return false;
    if (f.q && !(s.holder_name ?? "").toLowerCase().includes(f.q)) return false;
    if (f.sregion || f.smtn) {
      const last = lastVenueOf(s.id);
      if (f.sregion === "none") {
        // 只看还没排过的
        if (last !== null) return false;
      } else if (last !== null) {
        // **还没排过的资源一律不筛掉**：它不属于任何一片，但对哪一片都可用，
        // 筛掉等于把最灵活的那批资源藏起来，正好跟这个筛选的目的相反
        if (f.smtn && last.canonical !== f.smtn) return false;
        if (f.sregion && last.region !== f.sregion) return false;
      }
    }
    return true;
  });
  const hasFilter = Boolean(
    f.item || f.gender || f.q || f.sregion || f.smtn || f.sstatus !== "active"
  );
  const resourceTotal = (allResources ?? []).length;

  // 按区域 / 具体的地点筛订单。
  //
  // **只筛日历和统计，不筛资源面板那边的排期历史** —— 一个资源去过哪几个地点是它
  // 自己的事实，不该因为当前在看 RegionB 就少掉几段。bookedDays / assignHistory
  // 都是上面用全部订单算好的，这里不动它们。
  //
  // 状态筛选（ostatus）走的是同一条路：**日历和统计一起筛**。顶上那几个数字
  // 跟着筛选走是有意的 —— 「只看已完成的单」就该看到这批单的钱，
  // 不然筛完之后数字和下面的色块对不上，更难解释。
  // 不在白名单里的值一律当没筛（URL 是人能随便改的）。
  const orderFilter = {
    region: (searchParams.region ?? "") as Region | "",
    mtn: searchParams.mtn ?? "",
    status: STATUS_LABELS[searchParams.ostatus ?? ""] ? searchParams.ostatus! : "",
  };
  const hasOrderFilter = Boolean(
    orderFilter.region || orderFilter.mtn || orderFilter.status
  );
  const matchesOrderFilter = (o: any) => {
    if (orderFilter.status && o.status !== orderFilter.status) return false;
    if (orderFilter.mtn) return sameVenue(o.location, orderFilter.mtn);
    if (orderFilter.region) {
      return normalizeLocation(o.location)?.region === orderFilter.region;
    }
    return true;
  };

  const withDays = (orders ?? []).filter(
    (o: any) => o.demand_days && o.demand_days.length > 0 && matchesOrderFilter(o)
  );

  const allDays = withDays.flatMap((o: any) => o.demand_days).sort();

  const shiftDay = (iso: string, delta: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  // 每行排几天。拖右边那根条改，设置页里也能改 —— 两边写的是同一处（库里的
  // app_settings），不是各存一份。服务端拿它切段：泳道要看整段里哪些单子重叠，
  // 段一变就全变，客户端算不了。
  const DAYS_PER_BAND = bandDaysSetting;

  const todayForTimeline = todayIso();

  let timeline: string[] = [];
  if (allDays.length > 0) {
    // 时间轴必须盖住"今天"：不然九月的单子做完了、现在已经十二月的时候，日历上
    // 压根没有十二月那几列，进来只能停在九月，也没法在今天附近拖新单子。
    const earliest =
      allDays[0] < todayForTimeline ? allDays[0] : todayForTimeline;
    const latest =
      allDays[allDays.length - 1] > todayForTimeline
        ? allDays[allDays.length - 1]
        : todayForTimeline;

    // 起点先往前留两天，再退到那一周的周一（getUTCDay：0=周日）。
    // 界面上指定了开始日期的话就原样用它，这一套默认不参与（见 lib/timelineStart.ts）
    const firstPadded = shiftDay(earliest, -2);
    const backToMonday = (new Date(`${firstPadded}T00:00:00Z`).getUTCDay() + 6) % 7;
    // 起始日期是**设置**不是筛选：筛选是「这一眼我想看什么」，看完就没了；
    // 这个是「以后每次进来都这样」，所以存在库里（/admin/settings），不走 URL
    const start = resolveTimelineStart(
      overviewStart ?? undefined,
      shiftDay(firstPadded, -backToMonday)
    );
    // 起点被拖到所有单子后面时，latest 会跑到 start 前面，dateRangeToArray 就空了 ——
    // 那样日历整个不见，连往后拖新单的空白都没有。所以末尾至少给起点留出一段
    let end = shiftDay(latest > start ? latest : start, 10);
    timeline = dateRangeToArray(start, end);
    // 补齐最后一段，让每段都是完整的 4 周；末尾多出来的空白正好用来拖拽建新单
    const remainder = timeline.length % DAYS_PER_BAND;
    if (remainder !== 0) {
      end = shiftDay(end, DAYS_PER_BAND - remainder);
      timeline = dateRangeToArray(start, end);
    }

    // 最后一段必须是空的：留一整段空白在最底下，往后加新单子随时有地方拖。
    // 最后一段里只要还有单子，就再往后接一段 4 周，直到接出一段完全空的。
    while (
      withDays.some((o: any) =>
        (o.demand_days as string[]).some((d) =>
          timeline.slice(timeline.length - DAYS_PER_BAND).includes(d)
        )
      )
    ) {
      end = shiftDay(end, DAYS_PER_BAND);
      timeline = dateRangeToArray(start, end);
    }
  }

  // 起点定在中间的时候，整单落在起点之前的就一条都看不见了。数出来告诉人，
  // 别让单子无声无息地消失 —— 「明明建了单怎么没有」是这个项目最容易出的错觉
  const hiddenBeforeStart =
    timeline.length > 0 ? ordersBeforeStart(withDays as any[], timeline[0]).length : 0;

  // 库里已经存在的「同一个资源同一天配给两单」。拖日期那条路现在拦着了，但数据
  // 还可能从别处进来（两个人同时操作、直接改库、以前留下的），所以照样查一遍标红 ——
  // 拦得住新的，也得让旧的看得见
  const clashIndex = indexClashes(findClashes(usesByResource));
  const orderNameById = new Map<string, string>(
    (withDays as any[]).map((o) => [o.id, o.customers?.first_name ?? "另一单"])
  );

  const sorted = [...withDays].sort((a: any, b: any) =>
    a.demand_days[0] < b.demand_days[0] ? -1 : 1
  );

  // 每段单独排泳道：这一段只有一个单子就只占一行，段的高度自动跟着缩，
  // 不会像以前那样所有段都被最挤的那一段撑高
  type Band = {
    days: string[];
    colIndex: Map<string, number>;
    laneOf: Map<string, number>;
    laneCount: number;
  };
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
      while (bandLanes[lane] && bandLanes[lane].some((d) => daysHere.includes(d))) {
        lane += 1;
      }
      bandLanes[lane] = [...(bandLanes[lane] ?? []), ...daysHere];
      laneOf.set(o.id, lane);
    }
    const isLastBand = i + DAYS_PER_BAND >= timeline.length;
    bands.push({
      days,
      colIndex: new Map(days.map((d, j) => [d, j])),
      laneOf,
      laneCount: bandLanes.length + (isLastBand ? EXTRA_LANES_LAST : EXTRA_LANES),
    });
  }

  const today = todayIso();

  // 顶上那几个数字。口径见 lib/revenue.ts：单子按最早那天归属（跨周不拆），
  // 三个流水的结束点都是本周日，所以月和季的数里包含完整的本周。
  const { start: weekStart, end: weekEnd } = weekBounds(today);
  const weekOrderCount = countInRange(withDays, weekStart, weekEnd);
  const weekRevenue = sumInRange(withDays, weekStart, weekEnd);
  const monthRevenue = sumInRange(withDays, monthFirstDay(today), weekEnd);
  const seasonRevenue = sumInRange(withDays, null, weekEnd);

  // 本周未配齐：跟上面几个数字同一套归属规则（按最早那天算本周），
  // 取消/退款的单子不用分配所以排除掉
  const weekNotFullyAssigned = withDays.filter(
    (o: any) =>
      startsInRange(o, weekStart, weekEnd) &&
      countsTowardRevenue(o.status) &&
      !computeNeed(o, assignedTo.get(o.id) ?? []).isComplete
  ).length;

  const assigningOrder = searchParams.assign
    ? withDays.find((o: any) => o.id === searchParams.assign)
    : null;
  const assigningNeed = assigningOrder
    ? computeNeed(assigningOrder, assignedTo.get((assigningOrder as any).id) ?? [])
    : null;

  // 正在配的这一单，配上的这几个资源「上一次分别用在哪一单」—— 把那几单轻轻点亮。
  // 分配不是孤立的决定：同一个资源上一单去哪儿了、结没结清，都影响这一单怎么排。
  // 以前得自己在日历上找，现在配上就自动亮出来
  const previousUseOrders = assigningOrder
    ? previousOrdersFor(
        (assigningOrder as any).id,
        (assigningOrder as any).demand_days ?? [],
        (assignedTo.get((assigningOrder as any).id) ?? []).map((sp: any) => sp.id),
        usesByResource
      )
    : new Set<string>();

  // 顶上那条浮动条里「输入物主名字分配」的候选。
  //
  // 用的是 allResources 不是筛选后的 resources：打名字本来就是绕开左边筛选的快捷方式，
  // 筛掉的资源也该能直接叫出来。四条校验一条不少 —— 这里只是把「点得到」变成
  // 「叫得出」，能不能配还是服务端说了算（route.ts 会再校验一遍）。
  const assignableByName = (() => {
    if (!assigningOrder || !assigningNeed) return [];
    const order: any = assigningOrder;
    const assignedIds = new Set(
      (assignedTo.get(order.id) ?? []).map((x: any) => x.id)
    );
    const ok = (allResources ?? []).filter((s: any) => {
      if (assignedIds.has(s.id)) return false;
      if (s.status !== "active") return false;
      if (itemConflictReason(s, order.location)) return false;
      if (!coversOrder(s, order.demand_days)) return false;
      const booked = new Set(bookedDays.get(s.id) ?? []);
      if ((order.demand_days ?? []).some((d: string) => booked.has(d))) return false;
      // 这个性别还有缺口才算数：男资源配齐了就别再让人叫出男资源
      const gapForGender =
        s.holder_gender === "male"
          ? assigningNeed.maleGap
          : s.holder_gender === "female"
            ? assigningNeed.femaleGap
            : 0;
      return gapForGender > 0;
    });

    // 推荐的排前面 —— 打字时列表第一个就是最该配的那张
    const scored = new Map(
      recommendResources({
        order: {
          customerId: order.customer_id ?? null,
          location: order.location ?? null,
          demandDays: order.demand_days ?? [],
        },
        customerAge: calcAge(order.customers?.date_of_birth),
        candidates: ok.map((s: any) => ({
          id: s.id,
          itemType: s.item_type ?? null,
          holderDateOfBirth: s.holder_date_of_birth ?? null,
          providerId: s.provider_id ?? null,
          bookedDays: bookedDays.get(s.id) ?? [],
        })),
        history: assignHistory,
        assignedProviderIds: (assignedTo.get(order.id) ?? []).map((x: any) => x.provider_id),
      }).map((x) => [x.resourceId, x])
    );

    return ok
      .map((s: any) => ({
        id: s.id,
        name: (s.holder_name ?? "").trim(),
        hint: [
          s.holder_gender === "male" ? "男" : s.holder_gender === "female" ? "女" : "",
          calcAge(s.holder_date_of_birth) ? `${calcAge(s.holder_date_of_birth)}岁` : "",
          s.item_type ?? "",
          scored.get(s.id)?.top ? "★ 推荐" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        score: scored.get(s.id)?.score ?? 0,
      }))
      .filter((c) => c.name)
      .sort((a, b) => b.score - a.score);
  })();

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (f.item) p.set("item", f.item);
    if (f.gender) p.set("gender", f.gender);
    if (f.sstatus !== "active") p.set("sstatus", f.sstatus); // active 是默认，不写进 URL
    if (f.q) p.set("q", f.q);
    if (f.sregion) p.set("sregion", f.sregion);
    if (f.smtn) p.set("smtn", f.smtn);
    // 默认那档不写进 URL，链接短一点；parseResourceSort 拿不到也会退回默认
    if (searchParams.ssort && searchParams.ssort !== DEFAULT_RESOURCE_SORT) {
      p.set("ssort", searchParams.ssort);
    }
    if (searchParams.assign) p.set("assign", searchParams.assign);
    if (searchParams.allcards) p.set("allcards", searchParams.allcards);
    if (searchParams.region) p.set("region", searchParams.region);
    if (searchParams.mtn) p.set("mtn", searchParams.mtn);
    if (searchParams.ostatus) p.set("ostatus", searchParams.ostatus);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/overview?${s}` : "/admin/overview";
  };

  return (
    <main>
      <h1 style={pageTitleStyle}>排期总览</h1>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      {/* 色块里的数字框不要那对上下箭头：一个箭头组要十几像素，三个框（男/女/金额）
          加起来将近 50——一天的单子色块只有一列宽，就是这 50px 让金额被挤出去。
          反正这几个数都是直接敲的，没人会去点箭头。
          Firefox 走 appearance:textfield（写在 style 里），Chrome/Safari 得干掉
          ::-webkit-*-spin-button 这个伪元素，只能用 CSS 写。 */}
      {/* 这段 CSS 必须用 dangerouslySetInnerHTML，不能写成 <style>{`...`}</style>。
          React 把 <style> 的文本子节点当普通文本转义，服务端会把 " 变成 &quot;；
          而 <style> 在 HTML 里是 raw text 元素，浏览器**不会**把 &quot; 还原回引号。
          结果两头对不上（hydration 报 "Text content does not match server-rendered
          HTML"），而且更要命的是选择器变成了 input[type=&quot;number&quot;]，
          什么都匹配不到——这条规则曾经整个是死的，上下箭头一直还在。
          dangerouslySetInnerHTML 原样输出，不转义。这里是写死的字符串，没有注入面。 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        #assign-active-block input[type="number"]::-webkit-outer-spin-button,
        #assign-active-block input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          appearance: none;
          margin: 0;
        }
        /* 一天的单子色块只有一列宽（COL_WIDTH，150px），第 3 行放不下「男x/y 女x/y + 状态 + 金额」。
           这时候把状态下拉框和删除叉都藏掉（132px 时实测第 3 行溢出 31px；
           加宽到 150 之后仍然放不下），
           只留分配进度和金额——那两个数才是排期时要看的。
           状态看色块颜色就知道；删除一天的单子去 Order 列表页，
           或者先把单子拉宽再删。
           备注框不用藏——它在第 1 行，那一行只有姓名和地点，挤得下。
           用容器查询而不是媒体查询：判断依据是这个色块自己有多宽（几天的单子），
           跟浏览器窗口多宽没关系。180 这个数落在「一天」(内容宽 138) 和
           「两天」(288) 中间，判得干脆。 */
        /* 分配模式下「已配的资源」这一行可以横着滚，把够不着的人划出来撤销。
           只给编辑中的这个色块开：日历最主要的手势就是左右拖，要是每个色块
           都吃掉横向滑动，整张表就没法平移了。
           滚动条要藏掉——这一行只有 14px 高，一条横向滚动条就把它吃没了。
           右边缘做一点淡出，当作「后面还有」的提示（本来是省略号的活儿，
           但省略号跟 overflow:auto 不能共存）；没溢出时那 10px 是空的，看不出来。 */
        #assign-active-block .cards-row {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 10px), rgba(0,0,0,0.25));
          mask-image: linear-gradient(to right, #000 calc(100% - 10px), rgba(0,0,0,0.25));
        }
        #assign-active-block .cards-row::-webkit-scrollbar { display: none; }

        /* 资源清单上「已排 …」那一行：单行，超出部分横着滚。
           右边渐隐是在说「后面还有」，比省略号更省地方 */
        .booked-row {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          /* 不做边缘渐隐：那层朦胧看着像没加载完，反而比硬切一刀更碍眼。
             溢出与否，滑一下就知道了 */
        }
        .booked-row::-webkit-scrollbar { display: none; }

        /* 备注框平时只占一个小方块（姓名和地点优先，它俩每单都有），
           点进去自动撑到一半宽好打字，挪走又缩回去。
           transition 让这一下不至于跳得太突兀。 */
        /* 输入框宽度贴着内容走（field-sizing:content），**不设 min-width** ——
           设了的话名字/地点名短的时候框比文字宽，后面的东西整体右移，
           进出编辑就又在动了。只有**空着**的时候才需要一个点得中的宽度，
           靠 :placeholder-shown 区分「空着」和「填了但很短」。 */
        #assign-active-block .assign-fit { min-width: 0; }
        #assign-active-block .assign-fit:placeholder-shown {
          min-width: var(--fit-empty, 28px);
        }

        #assign-active-block .assign-note { transition: min-width 120ms ease-out; }
        #assign-active-block .assign-note:focus-within { min-width: 55% !important; }

        @container (max-width: 180px) {
          /* 一天的单子（内宽 136px）曾经把状态下拉框整个藏掉 —— 等于一天的单子
             改不了状态。其实装得下，卡在那只 ▾ 上：带箭头的 select 要 59px 才
             显示得全「已分配」，去掉箭头只要 39px，而这儿能匀出 42.6px。
             所以窄色块上只去掉箭头，框还在、照样点得开。
             （跟地点名那个 <input list> 藏掉 ▾ 是同一个理由：几十像素宽的地方，
             一个箭头就占掉一半还挡字。） */
          #assign-active-block .assign-status select {
            appearance: none !important;
            -webkit-appearance: none !important;
            /* 自己的左右内边距也收到 1px：省下的 2px 是**需求侧**的，
               比在别处硬挤 2px 出来安全 */
            padding: 0 1px !important;
          }
          /* $ 符号还是要藏：不藏的话金额右边会被切掉 9px，
             「$120」看成「$12」比少个符号严重得多。旁边就是「男1/1 女0/1」，
             最右边那个数是钱，不会认错。
             **不限定 #assign-active-block**：普通态也要一起藏，不然窄色块
             进出编辑一个有 $ 一个没有 */
          .assign-money-sign { display: none !important; }
        }
`,
        }}
      />

      {/* 多选 + 批量改状态。它不渲染色块，只是全局听点击、注入一条高亮的 CSS，
          所以放在哪一层都行——放这儿是为了让浮动工具条脱离日历的滚动容器。 */}
      <BulkSelect />
      {/* 让分配模式那一行的「已配的资源」能用纵向滚轮横着滚，够到后面的人 */}
      <CardsRowScroll />
      {/* 从左边把资源拖到订单色块上分配。分配模式开不开都能用 */}
      <DragAssign />
      {/* 点色块进分配模式的即时反馈：整页重渲染要 420ms，这层先把「点到了」画出来 */}
      <OptimisticAssign />
      {/* 填地点名的输入框共用这一份补全列表 */}

      {/* 统计 / 状态图例 / 缩放 / 资源面板 / 日历 全交给 ZoomableCalendar 排版。
          缩放状态在客户端、统计是服务端渲染的，两者要挤在同一行就得由同一个
          客户端组件来渲染——所以统计行和资源面板当 props 传进去。 */}
      <ZoomableCalendar
        bandDays={DAYS_PER_BAND}
        railWidth={clampRailWidth(
          Number(cookies().get("overview_rail_width")?.value ?? NaN)
        )}
        panel={
          <ResourcePanel
            assignHistory={assignHistory}
            orderRegion={orderFilter.region}
            orderMtn={orderFilter.mtn}
            showAllCards={searchParams.allcards === "1"}
            showAllHref={qs({ allcards: "1" })}
            hideUnusableHref={qs({ allcards: "" })}
            bookingsByResource={bookingsByResource}
            sortBy={sortBy}
            // 四条链接在服务端拼好传下去 —— URL 怎么拼（哪些筛选要带过去、
            // 默认那档不写进去）是 qs 的事，菜单只管点
            sortHrefs={
              Object.fromEntries(
                (Object.keys(RESOURCE_SORTS) as ResourceSort[]).map((k) => [
                  k,
                  qs({ ssort: k === DEFAULT_RESOURCE_SORT ? "" : k }),
                ])
              ) as Record<ResourceSort, string>
            }
            // 收起状态服务端读 cookie 当初始值，首屏不会先展开再收起闪一下
            initialCollapsed={cookies().get("resource_panel_collapsed")?.value === "1"}
            // 筛选默认收起：平时都是直接看资源列表，筛选是偶尔为之
            filtersCollapsed={cookies().get("resource_filters_collapsed")?.value !== "0"}
            resources={resources}
            filters={f}
            hasFilter={hasFilter}
            total={resourceTotal}
            loadError={resourceError?.message}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            assigningNeed={assigningNeed}
            alreadyAssigned={
              assigningOrder
                ? new Set(
                    (assignedTo.get((assigningOrder as any).id) ?? []).map(
                      (s: any) => s.id
                    )
                  )
                : new Set<string>()
            }
          />
        }
        toolbar={
          <>
        <Stat label="本周订单数" value={String(weekOrderCount)} />
        <Stat label="本周流水" value={`$${weekRevenue.toLocaleString()}`} />
        <Stat label="本月流水" value={`$${monthRevenue.toLocaleString()}`} />
        <Stat label="本季流水" value={`$${seasonRevenue.toLocaleString()}`} />
        <Stat
          label="本周未配齐"
          value={String(weekNotFullyAssigned)}
          highlight={weekNotFullyAssigned > 0}
        />
        {/* 按区域 / 具体的地点筛订单。用 GET 表单不用 useState —— 跟这个项目里
            其它筛选一个路子，筛选状态留在 URL 上，刷新和分享链接都还在。
            选完自动提交（onChange 交给 FilterAutoSubmit，跟资源筛选共用）。 */}
        <FilterForm action="/admin/overview" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* 资源面板那边的筛选也在 URL 上，这个表单一提交就会把它们冲掉，
              所以原样带过去 */}
          {f.item && <input type="hidden" name="item" value={f.item} />}
          {f.gender && <input type="hidden" name="gender" value={f.gender} />}
          {f.sstatus !== "active" && (
            <input type="hidden" name="sstatus" value={f.sstatus} />
          )}
          {f.q && <input type="hidden" name="q" value={f.q} />}
          {searchParams.ssort && (
            <input type="hidden" name="ssort" value={searchParams.ssort} />
          )}
          {searchParams.assign && (
            <input type="hidden" name="assign" value={searchParams.assign} />
          )}
          {/* key 不能省：defaultValue 只在挂载时读一次，URL 上的参数变了（比如建完
              新单把筛选清掉了）而 DOM 节点被复用，下拉框会一直显示旧值 ——
              看起来就像「筛选还开着但没生效」。把值拼进 key，值一变就重新挂载。
              CLAUDE.md 里分配输入框那段记的是同一个坑。 */}
          <select
            key={`region-${orderFilter.region}`}
            name="region"
            defaultValue={orderFilter.region}
            style={filterSelectStyle}
          >
            <option value="">全部区域</option>
            {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
          {/* 地点这个下拉原来是**跟着最长的那条选项撑开**的（"全部地点" 才 4 个字，
              框却有 200 多 px），一个人看过去还以为是搜索框。三个筛选共用
              filterSelectStyle 的固定宽度，一条线上对齐。
              选项文字也从 `canonical · label` 收成只留 label —— 两者九成情况下
              就是同一个词（locbl · Locbl），显示两遍纯粹是把框撑长。 */}
          <select
            key={`mtn-${orderFilter.mtn}`}
            name="mtn"
            defaultValue={orderFilter.mtn}
            style={filterSelectStyle}
          >
            <option value="">全部地点</option>
            {LOCATION_OPTIONS.filter(
              (m) => !orderFilter.region || m.region === orderFilter.region
            ).map((m) => (
              <option key={m.value} value={m.value} title={m.hint}>
                {m.label}
              </option>
            ))}
          </select>
          {/* 按订单状态筛。下面那排色块只是图例（看颜色对应哪个状态），
              真要「只看待付款的单」得有个地方选 —— 就是这里。
              选项顺序直接吃 STATUS_LABELS，跟图例、跟色块里的下拉框同一个源。 */}
          <select
            key={`ostatus-${orderFilter.status}`}
            name="ostatus"
            defaultValue={orderFilter.status}
            style={filterSelectStyle}
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {hasOrderFilter && (
            <Link
              href={qs({ region: "", mtn: "", ostatus: "" })}
              style={{ fontSize: 12, color: "var(--text-faint)" }}
            >
              清除
            </Link>
          )}
        </FilterForm>
        {/* 有单子被挡在起点前面就说一声，并给一条改设置的路。
            悄悄少几个单子，比日历难看多了 */}
        {hiddenBeforeStart > 0 && (
          <Link
            href="/admin/settings"
            style={{ fontSize: 12, color: "var(--warn)", whiteSpace: "nowrap" }}
            title="去设置里改起始日期"
          >
            起始日期之前还有 {hiddenBeforeStart} 单没显示 →
          </Link>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const c = statusColor(key);
            return (
              <span
                key={key}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  color: c.text,
                }}
              >
                {label}
              </span>
            );
          })}
          {/* 「按住 ⌘ 点多个单子可以一起改状态」这件事原来没有任何提示 ——
              手势藏着，用的人自然以为功能没了。挨着状态图例放，因为这一排
              讲的正是状态 */}
          <span
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              alignSelf: "center",
              whiteSpace: "nowrap",
            }}
            title="按住 ⌘（Windows 上是 Ctrl）点几个单子，或者按住 Shift 点头尾连选，顶上会出来「状态改为」那一条"
          >
            ⌘/Shift + 点 = 多选改状态
          </span>
        </div>
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
                  assigningOrderId={assigningOrder ? (assigningOrder as any).id : null}
                  createOrderAction={createQuickOrder}
                  customerIdByName={customerIdByName}
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

                {(sorted as any[]).map((o) => {
                  // 这一段（4 周）里没有这个单子的日子就整个跳过
                  const bandLane = band.laneOf.get(o.id);
                  if (bandLane === undefined) return null;
                  const cards = assignedTo.get(o.id) ?? [];
                  const note = noteByOrder.get(o.id) ?? "";
                  // 地点名库里认不出来 —— 标红提醒去改，**不自动改**。
                  // 名字对不上，推荐分配那条线就是断的，而且断得无声无息
                  const badLocation = isUnknownLocation(o.location);
                  const locationHint = badLocation ? locationHintFor(o.location!) : "";
                  const need = computeNeed(o, cards);
                  const isAssigning = searchParams.assign === o.id;
                  // 正在配的这一单用的资源，上一次是在这一单上用的
                  const isPreviousUse = previousUseOrders.has(o.id);
                  // 分配模式里那几个输入框用的是 defaultValue（不受控），React 只在挂载时读一次；
                  // 撤销分配、拖拽改天数这些操作会在"还留在分配模式"的情况下改掉 o 的字段，
                  // 光 router.refresh() 拿到新数据不够——同一个 key 下 React 不会重新套 defaultValue，
                  // 输入框会继续显示改之前的老值。把这些字段拼进 key，值一变就强制重新挂载。
                  const editStateKey = [
                    o.amount,
                    o.status,
                    o.male_count,
                    o.female_count,
                    o.location,
                    o.customers?.first_name,
                    noteByOrder.get(o.id) ?? "",
                  ].join("|");
                  const allSorted = [...(o.demand_days as string[])].sort();
                  const firstDayOverall = allSorted[0];
                  const firstDayInBand = allSorted.find((d) => band.colIndex.has(d));
                  return contiguousRuns(o.demand_days).flatMap((run) => {
                    // 连续段跟"每 4 周一段"的边界不一定对齐，切出落在这一段里的那截
                    const seg = run.filter((d) => band.colIndex.has(d));
                    if (seg.length === 0) return [];
                    const start = band.colIndex.get(seg[0])!;
                    const segKey = `${o.id}-${seg[0]}-${editStateKey}`;
                    // 整个连续段都在这一段里才给拖拽改天数的把手：被边界切开的话，
                    // 拖出去那一头算不出正确日期，会把另一段的日子给抹掉
                    const runFullyInBand = seg.length === run.length;
                    // 摘要（姓名/价格/分配进度）每段显示一次，编辑控件全局只出现一次
                    const showDetail = seg[0] === firstDayInBand;
                    const showEdit = seg[0] === firstDayOverall;
                    const c = statusColor(o.status);
                    const blockStyle = {
                      gridRow: bandLane + 2,
                      gridColumn: `${start + 1} / span ${seg.length}`,
                      background: c.bg,
                      // 编辑态**不能**用更粗的边框：2px vs 1px 会把整块内容往下推 1px，
                      // 进出编辑时所有字都跳一下。改成同样的 1px，加粗的观感交给
                      // box-shadow——阴影不参与布局，几何一模一样。
                      border: `1px solid ${isAssigning ? "var(--link)" : c.border}`,
                      // 点亮「这几个资源上一单在哪儿」：用外发光，不动边框和底色 ——
                      // 状态颜色本身是有信息的（待付款 / 已完成…），盖掉就少了一层
                      boxShadow: isAssigning
                        ? "0 0 0 1px var(--link)"
                        : isPreviousUse
                          ? "0 0 0 2px var(--prev-use)"
                          : undefined,
                      color: c.text,
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 12,
                      overflow: "hidden",
                      lineHeight: 1.3,
                      // 空白处的新建选框也是这个 grid 的一员，没有这两条订单色块会被它盖住点不到
                      position: "relative",
                      zIndex: 1,
                      // 让 @container 那条「窄色块藏 $」的规则对普通态也生效 ——
                      // 只给分配态设的话，窄色块进出编辑就一个有钱号一个没有
                      containerType: "inline-size",
                    } as const;
                    const blockTitle = [
                      `${o.customers?.first_name ?? ""} ${o.customers?.last_name ?? ""}`,
                      `${o.location ?? "?"} · ${formatParty(o.male_count, o.female_count)} · ${o.demand_days.length}天`,
                      `$${o.amount ?? "?"} · ${STATUS_LABELS[o.status] ?? o.status}`,
                      `分配 ${formatNeed(need)}（${formatGap(need)}）`,
                      ...(note ? [`备注：${note}`] : []),
                      ...(badLocation ? [`⚠ ${locationHint}`] : []),
                      ...(isPreviousUse ? ["↑ 正在配的那一单，用的资源上次就是排在这儿"] : []),
                      ...cards
                        .map((s: any) => clashIndex.get(clashKey(o.id, s.id))?.[0])
                        .filter(Boolean)
                        .map(
                          (c: any) =>
                            `⚠ 冲突：${cards.find((s: any) => s.id === c.resourceId)?.holder_name ?? "有个资源"} 在 ${c.days.join("、")} 同时配给了「${orderNameById.get(c.otherOrderId) ?? "另一单"}」`
                        ),
                      ...cards.map(
                        (s: any) =>
                          `　${s.holder_gender === "male" ? "♂" : "♀"} ${s.holder_name}（${calcAge(s.holder_date_of_birth) ?? "?"}岁 ${s.item_type ?? ""}）`
                      ),
                    ].join("\n");

                    if (!isAssigning) {
                      return (
                        <Link
                          key={segKey}
                          data-order-id={o.id}
                          data-order-start={orderStartDay(o) ?? ""}
                          // 点下去那一刻，客户端要立刻拿它拼出分配浮动条的标题 ——
                          // 从色块的文字里猜太脆，直接把服务端用的那份原样带上
                          // 抢画那条假条要照着它决定放不放备注框 —— 真条只在
                          // 「这单还没备注」时才有那个框，不跟着的话接管那一刻整条会横着跳
                          data-order-has-note={note ? "1" : undefined}
                          data-order-label={[o.customers?.first_name ?? "?", o.location]
                            .filter(Boolean)
                            .join(" · ")}
                          href={qs({ assign: o.id })}
                          style={{
                            ...blockStyle,
                            textDecoration: "none",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                          title={blockTitle}
                        >
                          {showDetail && (
                            <>
                              {/* 第 1 行左边「姓名 · 地点」，右上角放备注（有才显示）：
                                  金额挪到第 3 行右下角了。格子窄的时候（一天的单子只有
                                  一列宽）两边都截断，备注最多占一半，剩下的留给名字。 */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "baseline",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    fontWeight: 500,
                                    minWidth: 0,
                                  }}
                                >
                                  {o.customers?.first_name ?? "?"}
                                  {o.location ? (
                                    <span
                                      title={locationHint || undefined}
                                      style={
                                        badLocation
                                          ? {
                                              fontWeight: 500,
                                              color: "var(--danger)",
                                              textDecoration: "underline wavy var(--danger)",
                                              textUnderlineOffset: 2,
                                            }
                                          : { fontWeight: 400, opacity: 0.7 }
                                      }
                                    >
                                      {` · ${o.location}`}
                                    </span>
                                  ) : null}
                                </span>
                                {/* 弹簧：把右边那一组顶到右边。**两个状态都放这一个**，
                                    位置就只由「右边那组各自多宽」决定 —— 分配态中间多出来
                                    一个状态框时，弹簧自己缩掉，备注和金额一像素都不挪 */}
                                <span style={{ flex: "1 1 0", minWidth: 0 }} />
                                {note ? (
                                  <span
                                    style={{
                                      maxWidth: "50%",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      fontSize: 11,
                                      fontWeight: 400,
                                      opacity: 0.75,
                                    }}
                                  >
                                    {note}
                                  </span>
                                ) : null}
                                {/* 金额挪到右上角。$ 用跟分配态同一个 class：
                                    色块窄到一定程度时两边一起藏，不然进出编辑一个有一个没有 */}
                                <span style={MONEY_SLOT}>
                                  <span className="assign-money-sign">$</span>
                                  {o.amount ?? "?"}
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "baseline",
                                  gap: 4,
                                  fontSize: 11,
                                  overflow: "hidden",
                                }}
                              >
                                <span
                                  data-need="1"
                                  style={{
                                    fontWeight: 500,
                                    color: need.isComplete ? "var(--ok)" : "var(--warn)",
                                    whiteSpace: "nowrap",
                                    // **不许被压。**「要几个资源、配了几张」是这一格里
                                    // 最该先看见的东西。挤不下时该让的是右边的物主名字，
                                    // 不是把「女1/1」截成「女…」——那等于把最关键的信息砍了。
                                    // 分配态那边本来就是 flexShrink:0，这边跟上
                                    flexShrink: 0,
                                  }}
                                >
                                  {/* 不用 formatNeed 拼字符串：分母要单独套进 COUNT_BOX，
                                      跟分配态那个输入框占一样宽，进出编辑这行才不动 */}
                                  {need.maleNeeded === 0 && need.femaleNeeded === 0 ? (
                                    "-"
                                  ) : (
                                    <>
                                      {need.maleNeeded > 0 && (
                                        <>
                                          男{need.maleFilled}/
                                          <span style={COUNT_BOX}>{need.maleNeeded}</span>
                                        </>
                                      )}
                                      {need.femaleNeeded > 0 && (
                                        <span
                                          style={{
                                            // 跟分配态那个 flex gap 同一个数
                                            marginLeft: need.maleNeeded > 0 ? COUNT_GAP : 0,
                                          }}
                                        >
                                          女{need.femaleFilled}/
                                          <span style={COUNT_BOX}>{need.femaleNeeded}</span>
                                        </span>
                                      )}
                                    </>
                                  )}
                                </span>
                              <div
                                style={{
                                  // 靠右：跟分配态那一份同一个锚。左边留给「男x/x 女x/x」
                                  marginLeft: "auto",
                                  minWidth: 0,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontSize: 11,
                                  opacity: 0.85,
                                }}
                              >
                                {cards.length > 0
                                  ? cards.map((s: any, i: number) => {
                                      const clash = clashIndex.get(clashKey(o.id, s.id));
                                      return (
                                        <span
                                          key={s.id}
                                          // 给几何测试当锚点：原来量的是「♀」那个字符，
                                          // 符号去掉之后得有别的东西钉住「卡片这一段挪没挪」
                                          data-card="1"
                                          // 冲突的资源标红：这个资源同一天还配在别的单上，
                                          // 核验那儿只有一个人能过，必须有人去改
                                          style={
                                            clash
                                              ? {
                                                  color: "var(--danger)",
                                                  fontWeight: 600,
                                                  textDecoration:
                                                    "underline wavy var(--danger)",
                                                  textUnderlineOffset: 2,
                                                }
                                              : undefined
                                          }
                                          title={
                                            clash
                                              ? `⚠ ${s.holder_name} 在 ${clash[0].days.join("、")} 同时配给了「${orderNameById.get(clash[0].otherOrderId) ?? "另一单"}」`
                                              : undefined
                                          }
                                        >
                                          {i > 0 ? " " : ""}
                                          {holderLabels.get(s.holder_name ?? "") ??
                                            s.holder_name}
                                        </span>
                                      );
                                    })
                                  : "未分配"}
                              </div>
                              </div>
                            </>
                          )}
                        </Link>
                      );
                    }

                    // 分配模式下这个单子的其它色块（不连续的、或者被段边界切开的那几截）：
                    // 只跟着高亮，编辑控件不重复放，不然页面上会有多个 assign-active-block
                    if (!showEdit) {
                      return (
                        <div
                          key={segKey}
                          data-order-id={o.id}
                          data-order-start={orderStartDay(o) ?? ""}
                          style={blockStyle}
                          title={blockTitle}
                        />
                      );
                    }

                    // 分配模式：点名字那行退出，已配的资源直接在色块里叉掉；左右边框可以拖，改这一段的起止日期
                    const editInner = (
                      <div
                        id="assign-active-block"
                        // 内边距 / 字号 / 行高都由外层的 blockStyle 给了，这儿别再写一遍 ——
                        // 写两遍就是下一次「进出编辑态错开几像素」的来源
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          height: "100%",
                          boxSizing: "border-box",
                          overflow: "hidden",
                        }}
                        title={blockTitle}
                      >
                        {showEdit && (
                          <>
                            {/* gap 是 0，分隔符自己带空格。普通态那行是一整串文字
                                「姓名 · 地点」，中间就是普通空格；编辑态要是用 flex gap
                                去凑，宽度永远差个一两像素，进出编辑就看得出来在动。
                                直接用同样的字符，横向位置自然就对上了。
                                备注跟前面那段的间距由它自己的 marginLeft 给 */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 0,
                                overflow: "hidden",
                              }}
                            >
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                // minWidth 跟里面输入框的下限对齐：只给 0 的话表单会被压到
                                // 比输入框还窄，输入框撑出去盖住旁边的地点和备注。
                                // 给到 48：姓名每一单都有，是这一行最该看见的东西，
                                // 不能为了给偶尔才填的备注腾地方就把它压没了。
                                // minWidth 交给里面的输入框（28）就够了：这儿再写 48 的话，
                                // 名字短的时候（「1123」才 27px）表单被撑到 48，后面的
                                // 「· 地点」整体右移二十几像素 —— 进编辑态就是「东西动了」
                                style={{ display: "flex", minWidth: 0, flexShrink: 1 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <input
                                  name="customer_name"
                                  className="assign-fit"
                                  // 有 placeholder 才能用 :placeholder-shown 区分「空着」和
                                  // 「填了但很短」—— minWidth 只该管前者，见下面那条注释
                                  placeholder="姓名"
                                  defaultValue={o.customers?.first_name ?? ""}
                                  data-original={o.customers?.first_name ?? ""}
                                  style={{
                                    ...FIELD_SIZING_CONTENT,
                                    // minWidth **不写在这儿**：写死 28 的话，名字短的
                                    // （「xhs」才 20px）会被撑到 28，后面的「· 地点」
                                    // 整体右移四五像素 —— 进出编辑又在动。
                                    // 交给 .assign-fit：填了就贴着内容，空着才留出点得中的宽度
                                    maxWidth: "100%",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    // 内边距必须是 0：普通态那行文字是从内容左边缘开始的，
                                    // 给 3px 就整行右移 3px
                                    padding: 0,
                                    color: "inherit",
                                    background: "transparent",
                                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                    // 占的横向位置，用内边距 +1 补回来。
                                    border: "none",
                                    lineHeight: 1.3,
                                  }}
                                />
                              </OptimisticEditForm>
                              {/* 连空格一起，跟普通态的 `{` · ${location}`}` 一模一样。
                                  whiteSpace: pre 是必须的，不然两头的空格会被折叠掉 */}
                              <span
                                style={{
                                  fontSize: 12,
                                  opacity: 0.7,
                                  flexShrink: 0,
                                  whiteSpace: "pre",
                                }}
                              >
                                {" · "}
                              </span>
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                // 地点同理，每单都有，给 40
                                // 同上：minWidth 交给里面的输入框，别在表单上再设一个
                                style={{ display: "flex", minWidth: 0, flexShrink: 1 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <LocationInput
                                  name="location"
                                  className="assign-fit"
                                  placeholder="地点"
                                  defaultValue={o.location ?? ""}
                                  data-original={o.location ?? ""}
                                  title={locationHint || undefined}
                                  style={{
                                    // 同上：minWidth 交给 .assign-fit，别写死
                                    ...FIELD_SIZING_CONTENT,
                                    ["--fit-empty" as any]: "22px",
                                    maxWidth: "100%",
                                    // 12 不是 11：普通态里地点跟姓名是同一串文字，
                                    // 同一个字号。写 11 的话一进编辑态地点就缩一号
                                    fontSize: 12,
                                    opacity: badLocation ? 1 : 0.7,
                                    padding: 0,
                                    // 地点名库里认不出来就标红。这里正好是能当场改掉的地方
                                    color: badLocation ? "var(--danger)" : "inherit",
                                    fontWeight: badLocation ? 600 : 400,
                                    background: "transparent",
                                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                    // 占的横向位置，用内边距 +1 补回来。
                                    border: "none",
                                    lineHeight: 1.3,
                                  }}
                                />
                              </OptimisticEditForm>
                              {/* 备注框顶到右上角，跟平时状态显示备注的位置**同一个地方**——
                                  进出编辑不用重新找。右对齐是为了让文字结束的位置也对上。
                                  flex:1 吃掉中间剩余宽度，也让它第一个被压缩：
                                  姓名和地点用的是 field-sizing:content，本来就只占内容那么宽。 */}
                              {/* 弹簧：把右边那一组顶到右边。跟普通态那一行放的是同一个 ——
                                  有了它，分配态中间多出来的状态框只会把弹簧压扁，
                                  备注和金额一像素都不挪。这是这一行「进出编辑不动」的关键 */}
                              <span style={{ flex: "1 1 0", minWidth: 0 }} />
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                className="assign-status"
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  // 跟里面 select 的 minWidth 保持一致：只给 0 的话外层
                                  // 缩到 0、里面的 select 撑出来，就压到金额上去了
                                  minWidth: 24,
                                  flexShrink: 1,
                                }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <select
                                  name="status"
                                  defaultValue={o.status}
                                  data-original={o.status}
                                  style={{
                                    fontSize: 11,
                                    // 高度写死 16：浏览器给 select 的默认行高比 11px 字号
                                    // 需要的多 3px，不压掉的话这几行正好撑出格子。
                                    // boxSizing 不能省，不然 padding 又加回去了。
                                    height: 16,
                                    lineHeight: "14px",
                                    padding: "0 2px",
                                    boxSizing: "border-box",
                                    color: "var(--text)",
                                    // 允许被挤扁，但留 24px 的底：再窄就只剩一条缝，
                                    // 看不出那是个下拉框、也点不中
                                    width: "100%",
                                    minWidth: 24,
                                  }}
                                >
                                  {/* 认不出来的状态要补一条 option，不然点一下别处
                                      就会被悄悄改写 —— 原因写在 statusOptions 里 */}
                                  {statusOptions(o.status).map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </OptimisticEditForm>
                              {/* **只有已经有备注的单子**才在色块里放这个框。
                                  空着的框是纯浪费 —— 多数单子没有备注，却让每个资源的
                                  编辑态常年挤着一个空框，还把姓名和地点往里压。
                                  没备注的去顶上那条浮动条加（AssigningBar 里的 NoteInput），
                                  两处永远只出现一个。
                                  已经有的就在这儿直接改：它本来就显示在这个位置，就地改最顺手 */}
                              {note ? (
                                <OptimisticEditForm
                                  exitHref={qs({ assign: "" })}
                                  className="assign-note"
                                  // flex-basis 给 0：宽松时把剩下的空间全吃掉（备注框要多大有多大），
                                  // 紧张时自己先缩到 22 这个「还点得进去」的下限，把地方让给
                                  // 姓名和地点——那两个每单都有，备注偶尔才有。
                                  // 缩成小方块之后也不影响用：点进去（:focus-within）会自动
                                  // 撑到一半宽，写完一挪走又缩回去，见上面那段 CSS。
                                  // marginLeft 4：普通态那一行「姓名·地点」和备注之间是 gap:4，
                                  // 编辑态整行 gap 改成 0 了，这一段的间距挪到这儿单独给
                                  // **flex-basis 必须是 0**。改成 auto 试过一次，当场就被
                                  // 几何测试逮住：基准按内容算的话，这个框会先占掉 71px，
                                  // 把姓名压到 11px、地点压到 26px，「·」整个左移 9.2px。
                                  // 基准 0 = 只吃剩余空间，永远不会从姓名地点嘴里抢。
                                  // 上限跟普通态那段备注一样 50%；真打字时 :focus-within
                                  // 会撑到 55%（见上面那段 CSS）
                                  style={{ display: "flex", flex: "1 1 0", maxWidth: "50%", minWidth: 22, marginLeft: 4 }}
                                >
                                  <input type="hidden" name="order_id" value={o.id} />
                                  <input
                                    name="note"
                                    placeholder="备注"
                                    defaultValue={note}
                                    data-original={note}
                                    style={{
                                      width: "100%",
                                      minWidth: 0,
                                      textAlign: "right",
                                      fontSize: 11,
                                      padding: "0 3px",
                                      color: "inherit",
                                      background: "transparent",
                                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                      // 占的横向位置，用内边距 +1 补回来。
                                      border: "none",
                                      lineHeight: 1.3,
                                    }}
                                  />
                                </OptimisticEditForm>
                              ) : null}
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <span
                                  className="assign-money-sign"
                                  style={{ fontSize: 11, opacity: 0.8, flexShrink: 0 }}
                                >
                                  $
                                </span>
                                <input
                                  name="amount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  defaultValue={o.amount ?? ""}
                                  data-original={o.amount ?? ""}
                                  style={{
                                    ...FIELD_SIZING_CONTENT,
                                    // 字号 / 淡度 / 右对齐跟普通态同一份（MONEY_SLOT）
                                    ...MONEY_SLOT,
                                    appearance: "textfield",
                                    // 不写死宽度：让 field-sizing 跟着金额位数走，
                                    // 三位数的单子就只占三位数的地方
                                    // minWidth 别给大：给 26 的话三位数的金额（约 21px）
                                    // 撑不满，输入框比文字宽，$ 被往左顶开五六像素，
                                    // 进出编辑钱号就跳。18 够点得中，其余交给 field-sizing
                                    minWidth: 18,
                                    maxWidth: 64,
                                    // 内边距 0：普通态的数字是贴着右边缘的，
                                    // 留 2px 数字就往左挪 2px
                                    padding: 0,
                                    color: "inherit",
                                    background: "transparent",
                                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                    // 占的横向位置，用内边距 +1 补回来。
                                    border: "none",
                                    lineHeight: 1.3,
                                  }}
                                />
                              </OptimisticEditForm>
                            </div>
                            {/* nowrap：格子只有一列宽（一天的单子）时卡片名会换行，
                                把写死高度的色块顶爆、底下那行被裁掉。宁可横着截断。
                                截断之后后面的人够不着，所以这一行做成可以横着滚的
                                （.cards-row，样式在上面那段 CSS 里）：触控板左右划、
                                Shift+滚轮是浏览器原生的，纵向滚轮由 CardsRowScroll 接管。 */}
                            {/* 进度和状态并排放一行：进度字很短，右边本来就空着。
                                分成两行的话色块压到 80px 高就装不下，状态框会被裁掉 */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 4,
                                // 一天的单子只有一列宽，六个输入框本来就塞不下；
                                // 让它横着截断，别把色块顶高（高度是写死的，顶高就被裁）
                                overflow: "hidden",
                              }}
                            >
                              {/* 分配进度和「几男几女」合成一个控件：分母本来就是要几个人，
                                  所以直接把 male_count/female_count 的输入框摆在分母的位置上。
                                  平时状态那一行显示的是同一个「男1/1 女1/1」，进出编辑不换位置。
                                  这里两个性别都画出来（formatNeed 会把 0 的那个藏掉），
                                  不然想给纯男单加一个女生就没有框可以填。 */}
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                data-need="1"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: COUNT_GAP,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <span
                                  style={{
                                    color: need.maleGap === 0 ? "var(--ok)" : "var(--warn)",
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  男{need.maleFilled}/
                                  <input
                                    name="male_count"
                                    type="number"
                                    min="0"
                                    defaultValue={o.male_count}
                                    data-original={o.male_count}
                                    style={{
                                      // 跟普通态那一格同一份尺寸（COUNT_BOX），不许各写各的
                                      ...COUNT_BOX,
                                      appearance: "textfield",
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: "inherit",
                                      background: "transparent",
                                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                      // 占的横向位置，用内边距 +1 补回来。
                                      border: "none",
                                      lineHeight: 1.3,
                                    }}
                                  />
                                </span>
                                <span
                                  style={{
                                    color: need.femaleGap === 0 ? "var(--ok)" : "var(--warn)",
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  女{need.femaleFilled}/
                                  <input
                                    name="female_count"
                                    type="number"
                                    min="0"
                                    defaultValue={o.female_count}
                                    data-original={o.female_count}
                                    style={{
                                      // 跟普通态那一格同一份尺寸（COUNT_BOX），不许各写各的
                                      ...COUNT_BOX,
                                      appearance: "textfield",
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: "inherit",
                                      background: "transparent",
                                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                                      // 占的横向位置，用内边距 +1 补回来。
                                      border: "none",
                                      lineHeight: 1.3,
                                    }}
                                  />
                                </span>
                              </OptimisticEditForm>
                            {/* 状态框和金额框都靠右下角：平时状态右下角显示的就是金额，
                                两边位置对得上 */}
                            {/* marginLeft:auto 把这一组顶到右边，**不能用 justifyContent:flex-end**：
                                那个在装不下的时候会往左边溢出去，压在分配进度上面（一天的单子
                                只有一列宽，正好会遇到）。auto margin 装不下时自动变 0，
                                多出来的部分往右边溢出，被上一层的 overflow:hidden 干净地切掉 */}
                              <div
                                className="cards-row"
                                // gap 归 0、淡度对齐普通态的 0.85：普通态这一行是一整串
                                // 「♂名字 ♀名字」，资源与资源之间就是个普通空格。用 flex gap
                                // 去凑宽度永远差一点，直接照抄那个空格（见下面的分隔符）
                                style={{
                                  display: "flex",
                                  flexWrap: "nowrap",
                                  // 靠右，跟普通态那一份同一个锚。左边留给「男x/x 女x/x」
                                  marginLeft: "auto",
                                  minWidth: 0,
                                  gap: 0,
                                  fontSize: 11,
                                  opacity: 0.85,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {cards.length > 0
                                  ? cards.map((s: any, i: number) => (
                                      <span
                                        key={s.id}
                                        className="assign-card"
                                        data-card="1"
                                        // relative：撤销那个叉靠它定位。叉是**绝对定位**的，
                                        // 不占位置 —— 原来它排在文字后面，一进分配模式
                                        // 后面所有东西就右移 14px，正是「进编辑东西动了」
                                        style={{ position: "relative", whiteSpace: "pre" }}
                                      >
                                        {i > 0 ? " " : ""}
                                        <span
                                          // 分配态里同样标红 —— 两个状态得说同一件事
                                          style={
                                            clashIndex.get(clashKey(o.id, s.id))
                                              ? {
                                                  color: "var(--danger)",
                                                  fontWeight: 600,
                                                  textDecoration: "underline wavy var(--danger)",
                                                  textUnderlineOffset: 2,
                                                }
                                              : undefined
                                          }
                                        >
                                          {holderLabels.get(s.holder_name ?? "") ??
                                            s.holder_name}
                                        </span>
                                        <UnassignButton
                                          orderId={o.id}
                                          resourceId={s.id}
                                          className="assign-card-x"
                                          style={{
                                            // 贴在这个资源的右上角，盖住后面一点点。
                                            // 平时透明+不可点，鼠标移到这个资源上才浮出来
                                            position: "absolute",
                                            right: -3,
                                            top: -4,
                                            width: 14,
                                            height: 14,
                                            padding: 0,
                                            margin: 0,
                                            boxSizing: "border-box",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRadius: 7,
                                            // 底色跟色块一样：盖在字上面也看得清
                                            background: c.bg,
                                            border: `1px solid ${c.border}`,
                                            color: "inherit",
                                            fontSize: 11,
                                            lineHeight: 1,
                                            zIndex: 2,
                                          }}
                                        />
                                      </span>
                                    ))
                                  : "未分配"}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );

                    if (!runFullyInBand) {
                      // 这一段被 4 周的边界切开了：不挂拖拽把手，只正常显示
                      return (
                        <div
                          key={segKey}
                          data-order-id={o.id}
                          data-order-start={orderStartDay(o) ?? ""}
                          style={{ ...blockStyle, padding: 0 }}
                        >
                          {editInner}
                        </div>
                      );
                    }

                    return (
                      <ResizableOrderBlock
                        key={segKey}
                        orderId={o.id}
                        orderStart={orderStartDay(o) ?? ""}
                        runStart={run[0]}
                        runEnd={run[run.length - 1]}
                        startIndex={start}
                        length={seg.length}
                        timeline={band.days}
                        laneRow={bandLane + 2}
                        // **必须从 blockStyle 派生，不能另写一份。**
                        // 这块反复出问题就是因为两个状态各维护一份样式：改了一边
                        // 忘了另一边，进出编辑态所有东西就错开几像素。
                        // 这里只覆盖「本来就该不一样」的那两条（边框颜色和光圈），
                        // 内边距、字号、行高、圆角一律跟着普通态走。
                        // gridRow / gridColumn 由 ResizableOrderBlock 自己算，
                        // 它在 spread 之后再写，覆盖得掉
                        style={{
                          ...blockStyle,
                          border: "1px solid var(--link)",
                          boxShadow: "0 0 0 1px var(--link)",
                        }}
                      >
                        {editInner}
                      </ResizableOrderBlock>
                    );
                  });
                })}
              </div>
              ))
        )}
      </ZoomableCalendar>

      {assigningOrder && (
        <AssigningBar
          orderId={(assigningOrder as any).id}
          note={noteByOrder.get((assigningOrder as any).id) ?? ""}
          candidates={assignableByName}
          label={[
            (assigningOrder as any).customers?.first_name ?? "?",
            (assigningOrder as any).location,
          ]
            .filter(Boolean)
            .join(" · ")}
          deleteAction={deleteOrder}
          exitHref={qs({ assign: "" })}
        />
      )}

      {assigningOrder && (
        <ClickOutsideDeselect
          exitHref={qs({ assign: "" })}
          orderId={(assigningOrder as any).id}
        />
      )}
    </main>
  );
}

function ResourcePanel({
  assignHistory,
  bookingsByResource,
  orderRegion,
  orderMtn,
  showAllCards,
  showAllHref,
  hideUnusableHref,
  resources,
  filters,
  sortBy,
  sortHrefs,
  hasFilter,
  total,
  loadError,
  bookedDays,
  assigningOrder,
  assigningNeed,
  alreadyAssigned,
  initialCollapsed,
  filtersCollapsed,
}: {
  assignHistory: PastUse[];
  bookingsByResource: Map<string, Booking[]>;
  showAllCards: boolean;
  showAllHref: string;
  hideUnusableHref: string;
  resources: any[];
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
  hasFilter: boolean;
  total: number;
  loadError?: string;
  bookedDays: Map<string, string[]>;
  assigningOrder: any;
  assigningNeed: any;
  alreadyAssigned: Set<string>;
  initialCollapsed: boolean;
  filtersCollapsed: boolean;
}) {
  // 每组按选中的方式重排。库里那条 .order("date_range_start") 排的是
  // 「资源什么时候开始生效」，跟挑资源这件事没关系 —— 挑资源时脑子里的顺序要么是
  // 年龄（登记了使用人的资源，年龄要跟客户对得上），要么是出借频率
  // （谁排得多、谁一直闲着），所以做成可选的。
  const cmp = compareResources(sortBy);
  const toSortable = (s: any) => {
    const runs = bookingsByResource.get(s.id) ?? [];
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
        clearHref="/admin/overview"
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
              <Link href="/admin/overview" style={linkButtonStyle}>
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
            gap={assigningNeed?.maleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
            assignHistory={assignHistory}
            bookingsByResource={bookingsByResource}
            allResources={resources}
            showAllCards={showAllCards}
            showAllHref={showAllHref}
            hideUnusableHref={hideUnusableHref}
          />
          <ResourceGroup
            title="女资源"
            symbol="♀"
            list={female}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            gap={assigningNeed?.femaleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
            assignHistory={assignHistory}
            bookingsByResource={bookingsByResource}
            allResources={resources}
            showAllCards={showAllCards}
            showAllHref={showAllHref}
            hideUnusableHref={hideUnusableHref}
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
}: {
  title: string;
  symbol: string;
  list: any[];
  bookedDays: Map<string, string[]>;
  assigningOrder: any;
  gap: number;
  alreadyAssigned: Set<string>;
  assignHistory: PastUse[];
  bookingsByResource: Map<string, Booking[]>;
  allResources: any[];
  showAllCards: boolean;
  showAllHref: string;
  hideUnusableHref: string;
}) {
  if (list.length === 0) return null;

  // 这个资源现在能不能配给这一单 —— 三条硬校验，跟服务端那份是同一套。
  // 推荐只在通过校验的资源里排序，绝不放宽任何一条。
  const canAssignResource = (s: any) => {
    if (!assigningOrder || alreadyAssigned.has(s.id) || gap <= 0) return false;
    if (s.status !== "active") return false;
    if (itemConflictReason(s, assigningOrder.location)) return false;
    if (!coversOrder(s, assigningOrder.demand_days)) return false;
    const booked = new Set(bookedDays.get(s.id) ?? []);
    return !assigningOrder.demand_days.some((d: string) => booked.has(d));
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

  const recommendations = new Map<string, Scored>();
  if (assigningOrder) {
    const assignedProviderIds = allResources
      .filter((s: any) => alreadyAssigned.has(s.id))
      .map((s: any) => s.provider_id);
    const scored = recommendResources({
      order: {
        customerId: assigningOrder.customer_id ?? null,
        location: assigningOrder.location ?? null,
        demandDays: assigningOrder.demand_days ?? [],
      },
      // 客户生日基本没人填（CLAUDE.md 待决定 #4），拿不到年龄这条就自动不参与
      customerAge: calcAge(assigningOrder.customers?.date_of_birth),
      candidates: assignable.map((s: any) => ({
        id: s.id,
        itemType: s.item_type ?? null,
        holderDateOfBirth: s.holder_date_of_birth ?? null,
        providerId: s.provider_id ?? null,
        bookedDays: bookedDays.get(s.id) ?? [],
      })),
      history: assignHistory,
      assignedProviderIds,
    });
    for (const x of scored) recommendations.set(x.resourceId, x);
  }

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
          const booked = [...new Set(bookedDays.get(s.id) ?? [])].sort();
          // 按订单分段、越近的越靠前。地方就那么点，排前面的才露得出来 ——
          // 一个资源去年排过十次跟今天要配的这单没关系，下周那次才有关系
          // 正序排，但这一行默认滚到最右边（CardsRowScroll 干的），
          // 所以一眼看到的是最近一次；早期的踪迹在左边，往左滑才出来
          const runs = sortChronologically(
            toBookingRuns(bookingsByResource.get(s.id) ?? [], todayIso())
          );
          const badge = abnormalBadge(s);
          const listingOk = s.status === "active";
          // 卡在「订单那几天」有效即可，跟今天过没过期无关
          const covers =
            assigningOrder && coversOrder(s, assigningOrder.demand_days);
          // 第四条校验：类型要能进这个地点。地点名认不出来就不拦
          const itemConflict = assigningOrder
            ? itemConflictReason(s, assigningOrder.location)
            : null;
          // 同一个资源同一天不能给两个订单用
          const conflictDays = assigningOrder
            ? assigningOrder.demand_days.filter((d: string) => booked.includes(d))
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
                      {rec.top ? "★ 推荐" : rec.score > 0 ? "☆" : "⚠"}
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

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
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
