import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, personSpread } from "@/lib/people";
import { displayName, formatPerson } from "@/lib/person";
import {
  ADMIN_COOKIE,
  CONTACT_FILTER_NONE,
  matchesOrderAdmin,
  parseOrderAdminFilter,
  resolveAdmin,
  resolvePrimaryAdmin,
} from "@/lib/admins";
import { addContact, loadAdmins } from "@/lib/personContacts";
import AdminSwitcher from "./AdminSwitcher";
import ClickOutsideDeselect from "./ClickOutsideDeselect";
import ZoomableCalendar from "./ZoomableCalendar";
import ResizableOrderBlock from "./ResizableOrderBlock";
import OptimisticEditForm from "./OptimisticEditForm";
import NewOrderSelector from "./NewOrderSelector";
import AssigningBar from "./AssigningBar";
import DragAssign from "./DragAssign";
import OptimisticAssign from "./OptimisticAssign";
import AssignEditor, { type EditorData } from "./AssignEditor";
import ResourcePanel from "./ResourcePanel";
import { nameCandidates, type PanelOrder } from "@/lib/assignPanel";
import InstantAssign, { type InstantEditors } from "./InstantAssign";
import {
  BLOCK_BASE_STYLE,
  COUNT_BOX,
  COUNT_GAP,
  FIELD_SIZING_CONTENT,
  MONEY_SLOT,
} from "./blockGeometry";
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
import { BAND_GAP, COL_WIDTH, EXTRA_LANES, clampRailWidth } from "@/lib/bandDays";
import { shortHolderNames } from "@/lib/holderName";
import {
  resolveTimelineStart,
  ordersBeforeStart,
  resolveTimelineEnd,
  ordersAfterEnd,
} from "@/lib/timelineStart";
import { previousOrdersFor, type ResourceUse } from "@/lib/previousUse";
import { findClashes, indexClashes, clashKey } from "@/lib/doubleBooking";
import { getOverviewStart, getOverviewEnd, getOverviewBandDays, getPrimaryAdminId } from "@/lib/appSettings";
import { adminColor, effectiveAdminId, orderFrame } from "@/lib/orderFrame";
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
  matchesLocationFilter,
  normalizeLocation,
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
  validityOverlaps,
} from "@/lib/resourceStatus";
import { compareByValidityStart } from "@/lib/validity";
import {
  inSeason,
  parseSeasonKey,
  seasonDays,
  seasonOf,
  seasonsBetween,
  type Season,
} from "@/lib/season";
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

// 一条时间轴拉到底横着能滑很久，改成每 4 周折一段往下排（跟 Excel 里那张排期表一个思路）。
// 段的起点对齐到周一，所以每段正好是 4 个完整自然周。
// 每行几天现在跟着右边那道帘子走（lib/bandWeeks.ts），不再是写死的。
// 帘子收着的时候就是 28 天 —— 原来的样子。
// EXTRA_LANES / BAND_GAP 在 lib/bandDays.ts（匹配台那张日历共用同一份）
// 最后一段底下留多一点：下面没有别的段接着了，往后加新单子都得在这儿拖。
// **这条只有排期总览有** —— 匹配台不能拖着建单
const EXTRA_LANES_LAST = 5;

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


  // 当前身份（标题旁边那个下拉，存在 cookie 里）：这单的客人记成这个管理员的
  // （= 哪个账号加的，以后找人知道用谁的号）。cookie 里的 id 得在库里真有这个人，
  // 不然记下的归属指向一个不存在的管理员。**跟找客人那条查询并排跑**，不多等一个来回
  const adminId = cookies().get(ADMIN_COOKIE)?.value ?? "";
  const findAdmin = async () => {
    if (!adminId) return null;
    const { data } = await supabase.from("admins").select("id").eq("id", adminId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  // 同名客人复用，找不到就现建一个 —— 快速建单不打断流程去 Customer 页面
  // 名字在 people 上，但只在**客户**里找（!inner = 没有 customers 这一行的人不算）——
  // 同名的物主不该被顺手拉来下单
  const findCustomer = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, people!inner(chat_name)")
      .ilike("people.chat_name", customerName)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const [admin, existingCustomerId] = await Promise.all([findAdmin(), findCustomer()]);
  // 拦在任何写库之前。界面上没选身份时「创建」是灰的，这里拦的是旧页面和直接 POST
  if (!admin) throw new Error("还没选当前身份（排期总览标题旁边），选了才知道这个客人记在谁名下");

  // 建单弹窗里填的「客人」就是昵称（0020）—— 后台认人、显示都靠它
  const customerId = existingCustomerId ?? (await createPerson("customer", { chat_name: customerName }));
  // 老客人原来是别人加的也照样补上（别人的保留）：能给他建单，说明这个号也联系得上他。
  // 放在建单之前：这步失败就整个停住，不留一个建好了却没记归属的单子
  await addContact(customerId, admin);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      // 这一单是谁的（0019）：当前身份。排期总览按它筛
      admin_id: admin,
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
    /** 按「这一单是哪个管理员的」筛：管理员 id，或 none = 没标的 */
    oadmin?: string;
    sregion?: string;
    smtn?: string;
    ssort?: string;
    /** 看哪一季（lib/season.ts 的 key，25-26-na）。不写 = 今天所在的那季 */
    season?: string;
  };
}) {
  const todayForSeason = todayIso();
  const currentSeason = seasonOf(todayForSeason);
  const season: Season = parseSeasonKey(searchParams.season) ?? currentSeason;
  const isCurrentSeason = season.key === currentSeason.key;

  const [
    { data: orders, error },
    { data: rawResources, error: resourceError },
    { data: orderNotes },
    { data: dayNotes },
    { data: earliestOrder },
    { data: latestOrder },
    overviewStart,
    overviewEnd,
    bandDaysSetting,
    admins,
    primaryAdminRaw,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        // customer_id / 生日是推荐分配要用的：认「这个客人以前用的哪个资源」和年龄。
        // 分配跟着订单一起带回来，不再单独拉整张 order_assignments（那张表跟着
        // 历年的单子一起涨，单独拉就又是全量）
        `id, customer_id, admin_id, location, amount, status, demand_days, male_count, female_count, customers(${personSpread("chat_name, chat_id, first_name, last_name, date_of_birth")}), order_assignments(resource_id)`
      )
      // 有一天落在这一季里就算（lib/season.ts）。跨季的单两边都看得见
      .overlaps("demand_days", seasonDays(season)),
    supabase
      .from("resources")
      .select(
        // provider_id 是推荐要用的：同一单的两个资源如果同一个物主，取还跑一趟就够
        "id, provider_id, holder_name, holder_gender, holder_date_of_birth, item_type, validity, status"
      )
      // 物主删掉的资源不在这儿列 —— 这一页是干活的地方，配也配不上（lib/assignable.ts
      // 拦着）。库里还在，要看去 /admin/resources（迁移 0013）
      .is("deleted_at", null),
    supabase.from("order_notes").select("order_id, internal_note"),
    // 日期条上「这一天的备注」。整张表拉下来：一天一行，一个季撑死两三百行
    supabase.from("day_notes").select("day, note"),
    // 季下拉列哪几季：最早那单到最晚那单，各取一行。数组按第一个元素排序 ——
    // 绝大多数单子的 demand_days 是从小到大存的，但订单列表页手填的那条路不保证，
    // 所以这只是近似：最坏漏掉一头那一季的入口（URL 上直接写 season 照样能看）。
    // 为这个去全表扫一遍就又回到全量读了，不值
    supabase.from("orders").select("demand_days").order("demand_days", { ascending: true }).limit(1),
    supabase.from("orders").select("demand_days").order("demand_days", { ascending: false }).limit(1),
    // 日历从哪天开始。**跟上面几条并排跑**，不要单独 await 一次 ——
    // 这一页渲染一次本来就要 0.6~1.3 秒，再串一个来回纯属白等
    getOverviewStart(),
    getOverviewEnd(),
    getOverviewBandDays(),
    // 标题旁边「当前身份」那个下拉的名单（一共几行，跟着并排跑不多等）
    loadAdmins(),
    getPrimaryAdminId(),
  ]);
  // 主要管理员：没写是谁的单子算他的，他的单不上色（lib/orderFrame.ts）
  const primaryAdminId = resolvePrimaryAdmin(primaryAdminRaw, admins);
  const currentAdmin = resolveAdmin(cookies().get(ADMIN_COOKIE)?.value, admins);

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

  // 季下拉：最早那单到最晚那单的每一季，再把今天这季和正在看的这季也算进去
  // （新的一季还没单子时也得能选到它）
  const boundDays = [...(earliestOrder ?? []), ...(latestOrder ?? [])]
    .flatMap((o: any) => o.demand_days ?? [])
    .sort();
  const seasonEnds = [
    currentSeason,
    season,
    ...(boundDays.length ? [seasonOf(boundDays[0]), seasonOf(boundDays[boundDays.length - 1])] : []),
  ].sort((a, b) => (a.start < b.start ? -1 : 1));
  const seasonOptions = seasonsBetween(seasonEnds[0], seasonEnds[seasonEnds.length - 1]);

  // 资源：只列有效期跟这一季沾边的（往年的资源配不了今年的单，列出来只是占地方）。
  // 但**认分配记录用全部的** —— 一单配的资源万一有效期对不上这季（以前留下的），
  // 也得照样显示「配了谁」，不能让它看着像没配
  // 按开始生效排（原来是库里 .order("date_range_start")，有效期改成多段之后在内存里排，
  // 见 lib/validity.ts 的 compareByValidityStart）
  const allResources = (rawResources ?? [])
    .filter((s: any) => validityOverlaps(s, season.start, season.end))
    .sort(compareByValidityStart);
  const resourceById = new Map((rawResources ?? []).map((s: any) => [s.id, s]));
  const orderById = new Map((orders ?? []).map((o: any) => [o.id, o]));
  const assignments = (orders ?? []).flatMap((o: any) =>
    (o.order_assignments ?? []).map((a: any) => ({ order_id: o.id, resource_id: a.resource_id }))
  );

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
  // 都是上面用这一季的全部订单算好的，这里不动它们。（往年那几季的不在里面 ——
  // 资源基本一季一张，往年的资源配不了今年的单；有效期不限的那种跨物品，
  // 推荐时就只看得到它这一季的记录，为这个把历年分配全读一遍不划算）
  //
  // 状态筛选（ostatus）走的是同一条路：**日历和统计一起筛**。顶上那几个数字
  // 跟着筛选走是有意的 —— 「只看已完成的单」就该看到这批单的钱，
  // 不然筛完之后数字和下面的色块对不上，更难解释。
  // 不在白名单里的值一律当没筛（URL 是人能随便改的）。
  const orderFilter = {
    region: (searchParams.region ?? "") as Region | "",
    mtn: searchParams.mtn ?? "",
    status: STATUS_LABELS[searchParams.ostatus ?? ""] ? searchParams.ostatus! : "",
    // 这一单是哪个管理员的（orders.admin_id，0019）。跟状态一样，日历和统计一起筛 ——
    // 「只看我的单」就该看到我的单的钱
    admin: parseOrderAdminFilter(searchParams.oadmin, admins),
  };
  const hasOrderFilter = Boolean(
    orderFilter.region || orderFilter.mtn || orderFilter.status || orderFilter.admin
  );
  const matchesOrderFilter = (o: any) => {
    if (orderFilter.status && o.status !== orderFilter.status) return false;
    // 比的是算出来的归属：没写是谁的算主要管理员的
    if (!matchesOrderAdmin(effectiveAdminId(o.admin_id, primaryAdminId), orderFilter.admin)) return false;
    // 地点 / 区域那两条走 lib/locations.ts 那一份 —— 物主那边用的是同一个
    return matchesLocationFilter(o.location, orderFilter);
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

  // 设置里的起止日期只在这一季里面再缩小范围：落在这季外面的（比如去年设的）就当没设，
  // 不然切到另一季，日历要么从一年前画起、要么整个是空的
  const startSetting =
    overviewStart && inSeason(overviewStart, season) ? overviewStart : undefined;
  const endSetting = overviewEnd && inSeason(overviewEnd, season) ? overviewEnd : undefined;

  // 日历要盖住的几个点：这季的单子；看的是今天这季的话还有今天。
  // 一单都没有、今天也不在这季（翻到一个空的老季）就从季初画起 ——
  // 新的一季刚开始一单都没有时也照样有日历，能拖着建第一单
  const anchors = [...allDays];
  if (inSeason(todayForTimeline, season)) anchors.push(todayForTimeline);
  if (anchors.length === 0) anchors.push(season.start);
  anchors.sort();

  let timeline: string[] = [];
  {
    // 时间轴必须盖住"今天"：不然九月的单子做完了、现在已经十二月的时候，日历上
    // 压根没有十二月那几列，进来只能停在九月，也没法在今天附近拖新单子。
    // （看往年那季时今天不在季里，就不硬拉到今天 —— 那样会接上一大段空白）
    const earliest = anchors[0];
    const latest = anchors[anchors.length - 1];

    // 起点先往前留两天，再退到那一周的周一（getUTCDay：0=周日）。
    // 界面上指定了开始日期的话就原样用它，这一套默认不参与（见 lib/timelineStart.ts）
    const firstPadded = shiftDay(earliest, -2);
    const backToMonday = (new Date(`${firstPadded}T00:00:00Z`).getUTCDay() + 6) % 7;
    // 起始日期是**设置**不是筛选：筛选是「这一眼我想看什么」，看完就没了；
    // 这个是「以后每次进来都这样」，所以存在库里（/admin/settings），不走 URL
    const start = resolveTimelineStart(startSetting, shiftDay(firstPadded, -backToMonday));
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

    // 界面上指定了结束日期就原样截到那天：上面补齐整段、末尾留空白那两步都不作数。
    // 最后一行可以比别的行短 —— 看得出「日历到这儿就停了」（见 lib/timelineStart.ts）
    const explicitEnd = resolveTimelineEnd(endSetting, start);
    if (explicitEnd) timeline = dateRangeToArray(start, explicitEnd);
  }

  // 起点定在中间的时候，整单落在起点之前的就一条都看不见了。数出来告诉人，
  // 别让单子无声无息地消失 —— 「明明建了单怎么没有」是这个项目最容易出的错觉
  const hiddenBeforeStart =
    timeline.length > 0 ? ordersBeforeStart(withDays as any[], timeline[0]).length : 0;
  // 终点那头同理
  const hiddenAfterEnd =
    timeline.length > 0
      ? ordersAfterEnd(withDays as any[], timeline[timeline.length - 1]).length
      : 0;

  // 库里已经存在的「同一个资源同一天配给两单」。拖日期那条路现在拦着了，但数据
  // 还可能从别处进来（两个人同时操作、直接改库、以前留下的），所以照样查一遍标红 ——
  // 拦得住新的，也得让旧的看得见
  const clashIndex = indexClashes(findClashes(usesByResource));
  const orderNameById = new Map<string, string>(
    (withDays as any[]).map((o) => [o.id, displayName(o.customers, "另一单")])
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
  // 季流水 = 最早那天落在这季里的单（跨季的单整单算进开始那季，不按天拆）。
  // 以前起点是 null（「到本周日为止的所有单」），只有一季数据时看不出来；
  // 导入往年之后那个数是好几季加起来的。看往年那季时，结束点就是那季最后一天
  const seasonRevenue = sumInRange(
    withDays,
    season.start,
    isCurrentSeason && weekEnd < season.end ? weekEnd : season.end
  );

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

  // 左边资源清单（客户端组件）要的：每一单算一份「缺几张、配了哪几张、哪几天、哪个地点」，
  // 选中哪单取哪单。Map 传不到客户端，换成普通对象
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
  const bookedDaysRec = Object.fromEntries(bookedDays);
  const bookingsByResourceRec = Object.fromEntries(bookingsByResource);

  // 顶上那条浮动条里「输入物主名字分配」的候选。用的是 allResources 不是筛选后的 resources：
  // 打名字本来就是绕开左边筛选的快捷方式。判断在 lib/assignPanel.ts（资源清单也用它），
  // 能不能配还是服务端说了算（route.ts 会再校验一遍）
  const assignableByName = assigningOrder
    ? nameCandidates(panelOrders[(assigningOrder as any).id], allResources ?? [], bookedDaysRec, assignHistory)
    : [];

  // 今天这季是默认，不写进 URL；认不出来的 season 参数也不往下传
  const seasonParam = isCurrentSeason ? "" : season.key;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (seasonParam) p.set("season", seasonParam);
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
    if (searchParams.oadmin) p.set("oadmin", searchParams.oadmin);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/overview?${s}` : "/admin/overview";
  };

  // 每一单分配态色块要的数据，下面画日历时顺手收进来（只收不在分配态的那些），
  // 交给 InstantAssign：点下去当场画，不等整页渲染
  const instantEditors: InstantEditors = {};

  return (
    <main>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={pageTitleStyle}>排期总览</h1>
        <AdminSwitcher admins={admins} currentId={currentAdmin?.id ?? null} />
      </div>

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
            season={seasonParam}
            showAllCards={searchParams.allcards === "1"}
            showAllHref={qs({ allcards: "1" })}
            hideUnusableHref={qs({ allcards: "" })}
            bookingsByResource={bookingsByResourceRec}
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
            allResources={allResources ?? []}
            resourceIds={resources.map((s: any) => s.id)}
            filters={f}
            hasFilter={hasFilter}
            total={resourceTotal}
            loadError={resourceError?.message}
            bookedDays={bookedDaysRec}
            // 选中哪一单不再由服务端算好：清单搬到了客户端，点一单当场就换（ResourcePanel.tsx）
            serverAssigningId={assigningOrder ? (assigningOrder as any).id : null}
            orders={panelOrders}
            today={today}
          />
        }
        toolbar={
          <>
        <Stat label="本周订单数" value={String(weekOrderCount)} />
        <Stat label="本周流水" value={`$${weekRevenue.toLocaleString()}`} />
        <Stat label="本月流水" value={`$${monthRevenue.toLocaleString()}`} />
        <Stat
          label={isCurrentSeason ? "本季流水" : `${season.label} 流水`}
          value={`$${seasonRevenue.toLocaleString()}`}
        />
        <Stat
          label="本周未配齐"
          value={String(weekNotFullyAssigned)}
          highlight={weekNotFullyAssigned > 0}
        />
        {/* 按区域 / 具体的地点筛订单。用 GET 表单不用 useState —— 跟这个项目里
            其它筛选一个路子，筛选状态留在 URL 上，刷新和分享链接都还在。
            选完自动提交（onChange 交给 FilterAutoSubmit，跟资源筛选共用）。 */}
        <FilterForm action="/admin/overview" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* 看哪一季。放最前面：它决定读哪批数据，后面几个筛选都是在这一季里面再筛。
              今天这季的选项值是空的 —— 默认那档不写进 URL（FilterForm 会剔掉空值） */}
          <select
            key={`season-${season.key}`}
            name="season"
            defaultValue={seasonParam}
            style={filterSelectStyle}
            aria-label="季"
          >
            {seasonOptions.map((s) => (
              <option key={s.key} value={s.key === currentSeason.key ? "" : s.key}>
                {s.label}
                {s.key === currentSeason.key ? "（本季）" : ""}
              </option>
            ))}
          </select>
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
          {/* 这一单是哪个管理员的。名单跟标题旁边「当前身份」是同一份（admins 表），
              以后加了员工这里自动多一项。「没标」= 以前的单、客户自己发的需求 */}
          <select
            key={`oadmin-${orderFilter.admin}`}
            name="oadmin"
            defaultValue={orderFilter.admin}
            style={filterSelectStyle}
          >
            <option value="">全部管理员</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {/* 设了主要管理员之后，没写是谁的单都算他的，就不存在「没标」了 */}
            {!primaryAdminId && <option value={CONTACT_FILTER_NONE}>没标</option>}
          </select>
          {hasOrderFilter && (
            <Link
              href={qs({ region: "", mtn: "", ostatus: "", oadmin: "" })}
              style={{ fontSize: 12, color: "var(--text-faint)" }}
            >
              清除
            </Link>
          )}
        </FilterForm>
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
        {hiddenAfterEnd > 0 && (
          <span
            style={{ fontSize: 12, color: "var(--warn)", whiteSpace: "nowrap" }}
            title="在侧边栏「设置」里改结束日期"
          >
            结束日期之后还有 {hiddenAfterEnd} 单没显示
          </span>
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
          {/* 管理员的边框颜色图例：只列**非主要管理员**（只有他们的单上色），
              再说一句「其余是谁的」—— 不然满屏没颜色的单子，看不出那代表主要管理员 */}
          {admins
            .filter((a) => a.id !== primaryAdminId)
            .map((a) => {
              const color = adminColor(a.id, admins, primaryAdminId);
              return (
                <span
                  key={a.id}
                  data-admin-legend={a.name}
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: `1px solid ${color}`,
                    boxShadow: `inset 0 0 0 1px ${color}`,
                    color: "var(--text-muted)",
                  }}
                >
                  {a.name} 的单
                </span>
              );
            })}
          {primaryAdminId && (
            <span style={{ fontSize: 11, color: "var(--text-faint)", alignSelf: "center", whiteSpace: "nowrap" }}>
              其余是 {admins.find((a) => a.id === primaryAdminId)?.name} 的
            </span>
          )}
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
                  assigningOrderId={assigningOrder ? (assigningOrder as any).id : null}
                  createOrderAction={createQuickOrder}
                  adminName={currentAdmin?.name ?? null}
                  adminId={currentAdmin?.id ?? null}
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
                    displayName(o.customers, ""),
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
                    // 边框和光圈：状态 / 是哪个管理员的 / 选中 / 上一单，四件事一处算（lib/orderFrame.ts）。
                    // 分配态那份（ResizableOrderBlock）也从这里取，不另写
                    const providerColor = adminColor(
                      effectiveAdminId(o.admin_id, primaryAdminId),
                      admins,
                      primaryAdminId
                    );
                    const frame = orderFrame({
                      statusBorder: c.border,
                      adminColor: providerColor,
                      assigning: isAssigning,
                      previousUse: isPreviousUse,
                    });
                    const blockStyle = {
                      gridRow: bandLane + 2,
                      gridColumn: `${start + 1} / span ${seg.length}`,
                      background: c.bg,
                      // 编辑态**不能**用更粗的边框：2px vs 1px 会把整块内容往下推 1px，
                      // 进出编辑时所有字都跳一下。永远 1px，加粗的观感交给 box-shadow
                      // （阴影不参与布局，几何一模一样）—— 都在 orderFrame 里
                      border: frame.border,
                      boxShadow: frame.boxShadow,
                      color: c.text,
                      // 内边距 / 字号 / 行高这些跟哪一单无关的，在 blockGeometry.ts，
                      // 分配态（AssignEditor）也从那儿取
                      ...BLOCK_BASE_STYLE,
                    } as const;
                    const blockTitle = [
                      formatPerson(o.customers),
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

                    // 分配态色块要的数据。只有放编辑控件的那一段（showEdit）才算：
                    // 正在配的这一单拿它渲染；别的单收进 instantEditors，点下去当场画（InstantAssign）
                    const editorData: EditorData | null = showEdit
                      ? {
                          orderId: o.id,
                          orderStart: orderStartDay(o) ?? "",
                          // 从普通态那份派生：位置和颜色同 blockStyle，边框光圈换成分配态的
                          style: {
                            gridRow: blockStyle.gridRow,
                            gridColumn: blockStyle.gridColumn,
                            background: blockStyle.background,
                            color: blockStyle.color,
                            ...orderFrame({
                              statusBorder: c.border,
                              adminColor: providerColor,
                              assigning: true,
                            }),
                          },
                          resizable: runFullyInBand
                            ? {
                                runStart: run[0],
                                runEnd: run[run.length - 1],
                                startIndex: start,
                                length: seg.length,
                                laneRow: bandLane + 2,
                              }
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
                          })),
                          cardBg: c.bg,
                          cardBorder: c.border,
                        }
                      : null;
                    if (editorData && !isAssigning) {
                      instantEditors[o.id] = { ...editorData, band: bandIdx };
                    }

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
                          // 放编辑控件的那一段：点下去当场画分配态时，藏的是这一段（InstantAssign）
                          data-edit-seg={showEdit ? "1" : undefined}
                          data-order-label={[displayName(o.customers), o.location]
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
                                  {displayName(o.customers)}
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

                    // 分配模式：点名字那行退出，已配的资源直接在色块里叉掉；左右边框可以拖，改这一段的起止日期。
                    // 长什么样只在 AssignEditor 里（点下去当场画的 InstantAssign 也用它）
                    return (
                      <AssignEditor
                        key={segKey}
                        d={editorData!}
                        timeline={band.days}
                        exitHref={qs({ assign: "" })}
                      />
                    );
                  });
                })}
              </div>
              ))
        )}
      </ZoomableCalendar>

      {/* 点色块当场就是分配态：先在同一个格子里画上同一个编辑框，能直接打字，
          服务端那一份到了再把打的字搬过去。**必须写在 ZoomableCalendar 后面** ——
          instantEditors 是上面画日历时一单一单收进来的 */}
      <InstantAssign
        editors={instantEditors}
        bandDays={bands.map((b) => b.days)}
        exitHref={qs({ assign: "" })}
        // 浮动条「打名字分配」的候选不在这儿传数据：跟左边资源清单共用一份（assignSelection.ts）
        deleteAction={deleteOrder}
      />

      {assigningOrder && (
        <AssigningBar
          orderId={(assigningOrder as any).id}
          note={noteByOrder.get((assigningOrder as any).id) ?? ""}
          candidates={assignableByName}
          label={[
            displayName((assigningOrder as any).customers),
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
