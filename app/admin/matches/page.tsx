import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { formatParty } from "@/lib/party";
import { formatHolder } from "@/lib/age";
import Link from "next/link";
import { assignBlockReason } from "@/lib/assignable";
import { computeNeed, formatNeed } from "@/lib/assignment";
import { formatDayRanges } from "@/lib/dates";
import { MATCH_SORTS, firstDay, parseMatchSort, sortMatches } from "@/lib/matchSort";
import { isStaleMatch } from "@/lib/matchStatus";
import { groupMatchesByOrder, parseMatchView, type MatchView } from "@/lib/matchGroup";
import { buildMatchBoard, candidateOf } from "@/lib/matchBoard";
import AutoSubmitForm from "./AutoSubmitForm";
import { MIN_BAND_DAYS, MAX_BAND_DAYS } from "@/lib/bandDays";
import {
  getMatchesBandDays,
  getMatchesStart,
  setMatchesBandDays,
  setMatchesStart,
} from "@/lib/appSettings";
import MatchCalendar from "./MatchCalendar";
import { DISPLAY_COLUMNS, displayName, formatPerson } from "@/lib/person";
import { todayIso } from "@/lib/dates";
import {
  GAP_FILTER_LABELS,
  MATCH_STATUS_FILTER_LABELS,
  hasAnyMatchFilter,
  matchesMatchFilters,
  parseMatchFilters,
  type GapFilter,
  type MatchStatusFilter,
} from "@/lib/matchFilter";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import { STATUS_LABELS as ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import FilterForm from "../orders/FilterForm";
import { coversOrder, formatValidity } from "@/lib/resourceStatus";
import {
  formStyle,
  selectStyle,
  buttonStyle,
  rowStyle,
  headerRowStyle,
  cellStyle,
  pageTitleStyle,
  helpTextStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

/**
 * 每一列多宽。**唯一出处** —— 表头、筛选行、数据行三处都从这儿取，
 * 三份各写一个数字就是「第二份数字和第二份样式是同一个 bug」那条规矩里说的事：
 * 改了一处忘了另两处，列就错开了。
 *
 * Provider / Resource 那两列是弹性的，这里存的是它们的**下限** ——
 * 没下限的话屏幕一窄它们就被挤成一条，文字抖行，整张表糊成一团。
 */
const COL = {
  // 这一格要并排放下**两个日期框 + 排序下拉**（量出来的，见筛选行那条注释）
  date: 360,
  mtn: 132,   // 放得下「全部地点」
  customer: 100,
  party: 104,
  need: 116,
  ostatus: 124, // 放得下「全部订单状态」
  mstatus: 92,
  actions: 186,
  providerMin: 190,
  resourceMin: 250,
} as const;

/**
 * 整张表最窄到多宽 —— **算出来的，不是拍的**，所以加一列不用记得改它。
 * 窄过这个就横着滑，而不是把列挤爆。
 */
const MIN_TABLE_WIDTH =
  Object.values(COL).reduce((a, b) => a + b, 0) + 6 * 9; // 6px 的 gap × 列间隔

/** 聚合视图只剩四列（Provider / Resource / 状态 / 操作），窄得多 */
const GROUP_MIN_WIDTH =
  COL.providerMin + COL.resourceMin + COL.mstatus + COL.actions + 6 * 3 + 12;

async function createMatch(formData: FormData) {
  "use server";
  // Provider 从 resource 带出来，不重复存
  const { error } = await supabase.from("matches").insert({
    order_id: formData.get("order_id") as string,
    resource_id: formData.get("resource_id") as string,
    status: "proposed",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/matches");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
}

// 日历怎么排：每行几天、从哪天开始。**这一页自己的设置，跟排期总览无关** ——
// 两张表、两种用法，在这儿调一下不该把总览也带着变。
async function saveCalendarSettings(formData: FormData) {
  "use server";
  const days = Number(formData.get("band_days"));
  if (Number.isFinite(days)) await setMatchesBandDays(days);
  // 留空 = 回到默认起点；填了个不存在的日子也当没填（setOverviewStart 自己会验）
  await setMatchesStart(((formData.get("start") as string) ?? "").trim() || null);

  revalidatePath("/admin/matches");

  // 不用回一个「已保存」的标记：**日历自己就是反馈** —— 改了每行天数，带子当场重排；
  // 改了起始日，第一列就变了。再写一句「已按每行 N 天重排」，是把旁边那个输入框里
  // 已经写着的数字又念一遍
  const back = (formData.get("back") as string) ?? "/admin/matches";
  redirect(back);
}

async function updateMatchStatus(formData: FormData) {
  "use server";
  const matchId = formData.get("match_id") as string;
  const newStatus = formData.get("status") as string;

  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  // chosen：把这个资源加到订单的分配里（一个订单可以配多张，1男1女要两张）
  //
  // **先验后写。** 原来是先把 matches.status 改成 chosen、再跑校验 —— 校验没过时
  // 状态已经写进去了，分配记录却没建，于是库里留下一条「显示已选中、其实没配上」
  // 的意向，而且页面直接崩在一个 Next 错误页上，什么原因也看不到。
  if (newStatus === "chosen") {
    // 订单那几天资源必须有效
    const [{ data: ord }, { data: sup }, { data: otherAssignments }, { data: alreadyRows }] =
      await Promise.all([
      supabase
        .from("orders")
        .select("demand_days, location, male_count, female_count")
        .eq("id", match.order_id)
        .single(),
      supabase
        .from("resources")
        .select(
          "id, validity, status, deleted_at, holder_name, holder_gender, item_type"
        )
        .eq("id", match.resource_id)
        .single(),
      supabase
        .from("order_assignments")
        .select("orders(demand_days)")
        .eq("resource_id", match.resource_id)
        .neq("order_id", match.order_id),
      // 这一单已经配了哪些资源 —— 判断配多了/配重了要用
      supabase
        .from("order_assignments")
        .select("resources(id, holder_gender)")
        .eq("order_id", match.order_id),
    ]);
    if (!ord || !sup) redirect(`/admin/matches?error=${encodeURIComponent("订单或资源不存在")}`);
    // 校验走 lib/assignable.ts 那一份 —— 排期总览的 assign 和物主提意向用的是同一个
    const blocked = assignBlockReason({
      order: ord,
      resource: sup,
      alreadyAssigned: (alreadyRows ?? []).map((r: any) => r.resources).filter(Boolean),
      resourceBookedDays: (otherAssignments ?? []).flatMap(
        (r: any) => r.orders?.demand_days ?? []
      ),
    });
    // 拦住的时候**一个字都不写**，原因原样带回列表页显示 —— admin 要的就是
    // 「为什么配不上」（哪天撞了、谁已经配齐了），崩在错误页上等于什么都没说
    if (blocked) redirect(`/admin/matches?error=${encodeURIComponent(blocked)}`);

    const { error: assignError } = await supabase
      .from("order_assignments")
      .insert({ order_id: match.order_id, resource_id: match.resource_id });
    if (assignError) {
      redirect(`/admin/matches?error=${encodeURIComponent(assignError.message)}`);
    }

    // 不改 resources.status —— 占用情况由 order_assignments 算出来

    // 配齐了才把订单推进到 itemAssigned
    const [{ data: order }, { data: rows }] = await Promise.all([
      supabase
        .from("orders")
        .select("male_count, female_count, status")
        .eq("id", match.order_id)
        .single(),
      supabase
        .from("order_assignments")
        .select("resources(holder_gender)")
        .eq("order_id", match.order_id),
    ]);
    const need = computeNeed(
      order,
      (rows ?? []).map((r: any) => r.resources)
    );
    if (need.isComplete && order?.status === "created") {
      await supabase
        .from("orders")
        .update({ status: "itemAssigned" })
        .eq("id", match.order_id);
    }
  }

  // 校验都过了（或者根本不用校验）才写状态
  const { error: updateError } = await supabase
    .from("matches")
    .update({ status: newStatus })
    .eq("id", matchId);
  if (updateError) {
    redirect(`/admin/matches?error=${encodeURIComponent(updateError.message)}`);
  }

  revalidatePath("/admin/matches");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/");
}

export default async function MatchesAdminPage({
  searchParams,
}: {
  // 排序走 URL 参数，跟 admin 那几个列表页的筛选一个路子：能收藏、刷新不丢
  searchParams: Record<string, string | undefined>;
}) {
  const sort = parseMatchSort(searchParams.sort);
  const filters = parseMatchFilters(searchParams);
  const view = parseMatchView(searchParams.group);
  const grouped = view === "order";
  const calendar = view === "calendar";
  const filtering = hasAnyMatchFilter(filters);
  const [{ data: matches, error }, { data: orders }, { data: resources }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          `id, status, created_at, order_id, resource_id, orders(location, demand_days, status, male_count, female_count, customers(${personSpread(DISPLAY_COLUMNS)})), resources(id, status, deleted_at, item_type, holder_name, holder_gender, holder_date_of_birth, validity, providers(${personSpread(DISPLAY_COLUMNS)}))`
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, location, male_count, female_count")
        .in("status", ["created", "itemAssigned"]),
      supabase
        .from("resources")
        .select(
          `id, item_type, holder_name, holder_gender, holder_date_of_birth, validity, providers(${personSpread(DISPLAY_COLUMNS)})`
        )
        .eq("status", "active")
        .is("deleted_at", null),
    ]);

  // 这一单已经配了哪些资源 —— 匹配台上最该知道的一件事：
  // 「这单的男资源早就配上了，现在提上来的男资源插不进去」，不查就得点进订单页才看得见
  const orderIds = [...new Set((matches ?? []).map((m: any) => m.order_id))];
  const assignedByOrder = new Map<string, any[]>();
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_assignments")
      .select("order_id, resources(id, holder_gender)")
      .in("order_id", orderIds);
    for (const a of data ?? []) {
      const sup = (a as any).resources;
      if (!sup) continue;
      assignedByOrder.set(a.order_id, [...(assignedByOrder.get(a.order_id) ?? []), sup]);
    }
  }

  // supabase-js 把嵌套的 orders 推成数组类型（实际是单条），这一页其它地方也都
  // 用 any 绕开，排序这儿同理
  // 筛选在内存里做，跟 orderFilter / resourceFilter 一个路子：判断要用到「配齐了没」，
  // 那是从 order_assignments 现算的（CLAUDE.md：能算出来的不存字段），写进 SQL
  // 就得在两处维护同一套算法
  const today = todayIso();
  // 日历那张每行排几天。用的是排期总览那条设置，设置弹窗里能调
  const [bandDays, calendarStart] = calendar
    ? await Promise.all([getMatchesBandDays(), getMatchesStart()])
    : [0, null];
  // 落空与否**现算不存**：到了订单开始那天还没被选中就再也用不上了。
  // 在那之前留着当后备 —— 中标的那条可能退单，其余几条随时能顶上去。见 lib/matchStatus.ts
  const staleOf = (m: any) => isStaleMatch(m.status, firstDay(m), today);

  // 日历那张要「这个资源已经排出去了哪几天」—— 按 resource 聚一份。
  // 只查身上挂着意向的那几个资源，别的资源去排期总览看
  const resourceIds = [...new Set((matches ?? []).map((m: any) => m.resource_id))];
  const bookedByResource = new Map<string, string[]>();
  if (resourceIds.length > 0) {
    const { data } = await supabase
      .from("order_assignments")
      .select("resource_id, orders(demand_days)")
      .in("resource_id", resourceIds);
    for (const a of data ?? []) {
      const days = (a as any).orders?.demand_days ?? [];
      if (days.length === 0) continue;
      bookedByResource.set(a.resource_id, [...(bookedByResource.get(a.resource_id) ?? []), ...days]);
    }
  }

  // 日历那张的两份索引：每个资源身上挂着哪些意向、这个资源长什么样。
  // **用筛过的 rows 而不是全部** —— 筛选对三个视图都该生效
  const all = sortMatches((matches ?? []) as any[], sort);
  const rows = all.filter((m: any) => {
    const need = m.orders ? computeNeed(m.orders, assignedByOrder.get(m.order_id) ?? []) : null;
    return matchesMatchFilters(
      {
        matchStatus: m.status,
        orderStatus: m.orders?.status ?? null,
        location: m.orders?.location ?? null,
        customerName: displayName(m.orders?.customers, "") || null,
        providerName: displayName(m.resources?.providers, ""),
        holderName: m.resources?.holder_name ?? null,
        days: m.orders?.demand_days ?? [],
        isComplete: need ? need.isComplete : null,
        stale: staleOf(m),
      },
      filters
    );
  });

  // 日历用：一个订单挂着哪几条意向（顺序跟着上面的排序走）。
  // **资源的 status / deleted_at 必须取**（见上面那条 select）：日历要跑
  // assignBlockReason 判断每条意向现在能不能拍板，那套校验第一条看的就是挂牌状态 ——
  // 少取一个字段，整张表会全判成「这个资源不在出租中」，而且看不出是为什么
  const matchesByOrder = new Map<string, any[]>();
  for (const m of rows as any[]) {
    matchesByOrder.set(m.order_id, [...(matchesByOrder.get(m.order_id) ?? []), m]);
  }
  // 点开的那一单有哪几个人想接
  const assignOrder = searchParams.assign ?? "";
  const assignCandidates = assignOrder
    ? (matchesByOrder.get(assignOrder) ?? []).map((m: any) =>
        candidateOf(m, today, assignedByOrder, bookedByResource)
      )
    : [];
  const assignOrderRow = assignOrder ? (matchesByOrder.get(assignOrder) ?? [])[0] : null;

  return (
    <main>
      <h1 style={pageTitleStyle}>Match 匹配</h1>
      <p style={helpTextStyle}>
        人工把一个 Order 和一个 Provider 的 Resource 配上。状态从 proposed 走到
        chosen；选中 chosen 之后会自动把 Order 推进到 itemAssigned，Resource
        加进这个订单的分配里。配齐了（男女数量都够）订单才推进到 itemAssigned。
      </p>

      <form action={createMatch} style={formStyle}>
        <select name="order_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Order（未匹配的）
          </option>
          {orders?.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.location} · {formatParty(o.male_count, o.female_count)} ·{" "}
              {o.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select name="resource_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Resource（出租中的）
          </option>
          {resources?.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.holder_name ?? "?"}（
              {formatHolder(s.holder_gender, s.holder_date_of_birth)}）·{" "}
              {s.item_type} {formatValidity(s)} ·{" "}
              {displayName(s.providers, "")}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          创建匹配
        </button>
      </form>
      {error && <p style={{ color: "var(--danger)" }}>{error.message}</p>}
      {searchParams.error && <p style={actionErrorStyle}>没改成：{searchParams.error}</p>}

      {/* 整张表的三件事摆在一起：视图、排序、筛选。
          视图 —— 日历一个块一个订单（默认，匹配是按日期做的决定），聚合一行一个订单、
          底下挂着抢它的物主，平铺一行一个「订单 × 资源」。
          意向是多对多堆起来的，平铺时订单那六列每条意向都要重印一遍。 */}
      <div style={toolbarStyle}>
        {/* 默认那个摆左边 —— 段控件里左边那格默认就读作「常态」 */}
        <div style={segGroupStyle}>
          <Link href={viewHref(searchParams, "calendar")} style={calendar ? segActiveStyle : segStyle}>
            日历
          </Link>
          <Link href={viewHref(searchParams, "order")} style={view === "order" ? segActiveStyle : segStyle}>
            按单聚合
          </Link>
          <Link href={viewHref(searchParams, "flat")} style={view === "flat" ? segActiveStyle : segStyle}>
            平铺
          </Link>
        </div>
      </div>

      {/* 表头 + 紧贴其下的逐列筛选行。
          这一页原来是真 <table>，而 <form> 塞不进表格结构里 —— 所以改成跟
          /admin/resources 一样的 div 布局：筛选控件的 flex/width 跟表头一一对齐，
          就是表头下面的一行。FilterForm 跟 Order / Resource 两页共用：
          改一个条件就自动筛，空值不拼进 URL。 */}
      {/* 十列在笔记本或窄窗口下放不下。让表格**在自己这块地里横滑**，
          而不是把列挤到文字抖行（或者把整页撑出一条横条，那样侧边栏和标题也跟着跑）。
          之前包在 <table> 外面的那层，改成 div 布局时丢了。 */}
      <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: view === "flat" ? MIN_TABLE_WIDTH : view === "order" ? GROUP_MIN_WIDTH : 0 }}>
      {view === "flat" && (
      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, width: COL.date }}>日期</div>
        <div style={{ ...cellStyle, width: COL.customer }}>客户</div>
        <div style={{ ...cellStyle, width: COL.mtn }}>地点</div>
        <div style={{ ...cellStyle, width: COL.party }}>人数</div>
        <div style={{ ...cellStyle, width: COL.need }}>分配进度</div>
        <div style={{ ...cellStyle, width: COL.ostatus }}>订单状态</div>
        <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>Provider</div>
        <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }}>Resource</div>
        <div style={{ ...cellStyle, width: COL.mstatus }}>状态</div>
        <div style={{ ...cellStyle, width: COL.actions }}>操作</div>
      </div>
      )}

      {/* 筛选控件两种视图共用**同一份**，只换外面那层格子的样式：
          平铺时按列对齐（列就在头上），聚合时那些列不存在了，对齐没有意义，
          换成自然排布。控件本身一个字都不重写 —— 重写就是第二份。 */}
      {/* 日历的显示设置跟筛选**排在同一行**。两者是两个表单（一个写库的 Server Action、
          一个拼 URL 的 GET），合不成一个 <form>，但可以并排站在同一行里。
          说明那句话收进 title —— 一行里塞不下一句话，塞进去就把筛选挤到下一行了 */}
      <div style={view !== "flat" ? { ...oneLineStyle, marginBottom: 12 } : oneLineStyle}>
        {calendar && (
          <AutoSubmitForm action={saveCalendarSettings} style={calFormStyle}>
            <input type="hidden" name="back" value={pickHref(searchParams)} />
            <input
              type="date"
              name="start"
              title="日历从哪天开始。留空 = 回到默认"
              defaultValue={calendarStart ?? ""}
              style={filterInputStyle}
            />
            <input
              type="number"
              name="band_days"
              title="每行排几天"
              min={MIN_BAND_DAYS}
              max={MAX_BAND_DAYS}
              defaultValue={bandDays}
              style={{ ...filterInputStyle, width: 64 }}
            />
          </AutoSubmitForm>
        )}
      <FilterForm action="/admin/matches">
        <div
          style={
            view !== "flat"
              ? { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }
              : { ...rowStyle, background: "var(--surface-2)" }
          }
        >
          {/* 两个日期框并排。列宽是**量出来的**：在浏览器里撑一个 type=date 到
              内容最小宽度是 112px（年/月/日 + 那个小日历图标）。
              两个框是弹性的（各占一半），所以列宽 252 → 每个 124，比最小宽度多 12px。
              300 那一版每个框 148px，框里「年/月/日」右边空出一大截，很难看；
              框又不能缩到 112 以下，所以列宽就按「刚好让框接近自然宽度」来定。
              **不能再窄**：弹性项缩不到内容最小宽度以下，再窄就会溢出到隔壁列。

              **日历视图里不给这两个框**：那边上面已经有「从哪天开始」管日期窗口了，
              两个管同一件事的控件摆在一起只会让人猜哪个说了算。
              平铺和聚合没有那个设置，日期就得靠这儿筛。 */}
          <div
            style={
              calendar
                ? { display: "none" }
                : view !== "flat"
                  ? { display: "flex", gap: 4 }
                  : { ...cellStyle, width: COL.date, display: "flex", gap: 4 }
            }
          >
            <input
              name="from"
              type="date"
              title="从这天起（跟需求日期有交集就算）"
              defaultValue={filters.from}
              style={filterInputStyle}
            />
            <input
              name="to"
              type="date"
              title="到这天止（跟需求日期有交集就算）"
              defaultValue={filters.to}
              style={filterInputStyle}
            />
            {/* **排序跟日期放在一起**。它管的就是日期，摆在视图开关旁边不搭界；
                而且原来是三个小链接，跟旁边一排下拉不是一种东西 —— 换成下拉，
                跟别的筛选控件同一种形态，也就一起被 FilterForm 的「改了就自动筛」管着 */}
            <select
              name="sort"
              defaultValue={sort === "date" ? "" : sort}
              title="怎么排"
              style={filterInputStyle}
            >
              <option value="">{MATCH_SORTS.date}</option>
              <option value="dateDesc">{MATCH_SORTS.dateDesc}</option>
              <option value="created">{MATCH_SORTS.created}</option>
            </select>
          </div>
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.customer }}>
            <input
              name="customer"
              defaultValue={filters.customer}
              placeholder="客户"
              style={filterInputStyle}
            />
          </div>
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.mtn }}>
            {/* 占位文字要说清楚筛的是什么。光写「全部」，一排下拉摆在一起谁知道
                哪个是全部啥 —— 列宽不够就把列拉宽，不能靠人猜 */}
            <select name="mtn" defaultValue={filters.mtn} style={filterInputStyle}>
              <option value="">全部地点</option>
              {LOCATION_OPTIONS.filter(
                (m) => !filters.region || m.region === filters.region
              ).map((m) => (
                <option key={m.value} value={m.value} title={m.hint}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {/* 人数那列没什么好筛的，拿来放区域 —— 它跟地点是一对，挨着才好用 */}
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.party }}>
            <select name="region" defaultValue={filters.region} style={filterInputStyle}>
              <option value="">全部区域</option>
              {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.need }}>
            <select name="gap" defaultValue={filters.gap} style={filterInputStyle}>
              {(Object.keys(GAP_FILTER_LABELS) as GapFilter[]).map((k) => (
                <option key={k} value={k}>
                  {GAP_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.ostatus }}>
            <select name="ostatus" defaultValue={filters.ostatus} style={filterInputStyle}>
              <option value="">全部订单状态</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/* 物主和持有人一个框一起搜 —— 找人的时候没人分得清自己记住的是哪一个。
              框放在 Provider 那列，横跨 Provider + Resource 两列的意思 */}
          <div style={view !== "flat" ? { width: 150 } : { ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>
            <input
              name="resource"
              defaultValue={filters.resource}
              placeholder="物主 / 持有人"
              style={filterInputStyle}
            />
          </div>
          {view === "flat" && <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }} />}
          <div style={view !== "flat" ? { width: 130 } : { ...cellStyle, width: COL.mstatus }}>
            <select name="mstatus" defaultValue={filters.mstatus} style={filterInputStyle}>
              {(Object.keys(MATCH_STATUS_FILTER_LABELS) as MatchStatusFilter[]).map((k) => (
                <option key={k} value={k}>
                  {MATCH_STATUS_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div
            style={
              view !== "flat"
                ? { display: "flex", gap: 8, alignItems: "center" }
                : { ...cellStyle, width: COL.actions, display: "flex", gap: 8, alignItems: "center" }
            }
          >
            {filtering && (
              <>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {rows.length}/{all.length}
                </span>
                <Link href={clearFiltersHref(searchParams)} style={clearFilterStyle}>
                  清掉
                </Link>
              </>
            )}
          </div>
        </div>
      </FilterForm>
      </div>

      {calendar && (
        <MatchCalendar
          board={buildMatchBoard({
            today,
            matchesByOrder,
            assignedByOrder,
            bookedByResource,
            start: calendarStart ?? undefined,
          })}
          // 每行几天**跟排期总览共用同一个设置**（设置弹窗里那一项）——
          // 两页各存一个的话，调了一处另一处不动，就成了两套记忆
          bandDays={bandDays}
          assign={searchParams.assign ?? ""}
          href={(extra) => pickHref(searchParams, extra)}
        />
      )}

      {/* 点开一个单子之后列出谁愿意接它 —— 这就是这张日历跟排期总览的差别：
          总览列的是全部资源让你挑，这儿只列已经有人主动说想接的那几张。
          配不上的不给按钮，直接把原因写出来，省得点下去才被拦 */}
      {calendar && assignOrder && (
        <div style={candidatePanelStyle}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <b>
              {formatDayRanges(assignOrderRow?.orders?.demand_days ?? [])} ·{" "}
              {displayName(assignOrderRow?.orders?.customers, "-")}
              {assignOrderRow?.orders?.location ? ` · ${assignOrderRow.orders.location}` : ""}
            </b>
            <span style={{ color: "var(--text-muted)" }}>
              {" "}
              · {assignCandidates.length} 个物主想接
            </span>
            <Link
              href={pickHref(searchParams, { assign: "" })}
              style={{ marginLeft: 10, fontSize: 12, color: "var(--text-muted)" }}
            >
              收起
            </Link>
          </div>
          {assignCandidates.map((c) => (
            <div key={c.matchId} style={candidateRowStyle}>
              <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>{c.providerLine}</div>
              <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }}>
                {c.holderName}
                <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{c.holderLine}</div>
              </div>
              <div style={{ ...cellStyle, flex: 2 }}>
                {c.chosen ? (
                  <span style={{ color: "var(--ok)" }}>已经选了这张</span>
                ) : c.stale ? (
                  <span style={{ color: "var(--text-faint)" }}>已过期 —— 这一单已经开始了</span>
                ) : c.blocked ? (
                  <span style={{ color: "var(--text-faint)" }}>配不上：{c.blocked}</span>
                ) : (
                  <form action={updateMatchStatus}>
                    <input type="hidden" name="match_id" value={c.matchId} />
                    <input type="hidden" name="status" value="chosen" />
                    <button type="submit" style={buttonStyle}>
                      就选这张
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {grouped &&
        groupMatchesByOrder(rows as any[]).map((g) => {
          const o = g.first.orders;
          const days = o?.demand_days ?? [];
          const need = o ? computeNeed(o, assignedByOrder.get(g.orderId) ?? []) : null;
          return (
            <div key={g.orderId} style={groupStyle}>
              {/* 订单信息**只印一遍**。平铺时这六列每条意向重印一遍，
                  而「这一单有几个人想接、我得挑一个」反倒要靠眼睛把相邻几行认出来 */}
              <div style={orderHeadStyle}>
                <b>
                  {days.length > 0 ? `${formatDayRanges(days)} · ${days.length}天` : "没填日期"}
                </b>
                <span style={{ color: "var(--text-muted)" }}>
                  {/* 先人后地点：这一单是谁求的，比它去哪儿更该先看到。
                      客户的聊天不放这儿 —— 匹配这一步要联系的是物主，不是客户 */}
                  {displayName(o?.customers, "-")} ·{" "}
                  {o?.location || "没填地点"} · {formatParty(o?.male_count, o?.female_count)}
                </span>
                <span style={{ color: need?.isComplete ? "var(--ok)" : undefined }}>
                  {need ? formatNeed(need) : "-"}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {o?.status ? ORDER_STATUS_LABELS[o.status] ?? o.status : "-"}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                  {g.matches.length} 个物主想接
                </span>
              </div>
              {g.matches.map((m: any) => (
                <div key={m.id} style={candidateRowStyle}>
                  <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>
                    {formatPerson(m.resources?.providers)}
                  </div>
                  <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }}>
                    {m.resources?.holder_name ?? "-"}{" "}
                    <span style={{ color: "var(--text-faint)" }}>
                      {formatHolder(m.resources?.holder_gender, m.resources?.holder_date_of_birth)}
                    </span>
                    <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
                      {m.resources?.item_type} {formatValidity(m.resources)}
                    </div>
                  </div>
                  <div style={{ ...cellStyle, width: COL.mstatus }}>
                    <MatchStatusText status={m.status} stale={staleOf(m)} />
                  </div>
                  <div style={{ ...cellStyle, width: COL.actions }}>
                    <MatchActions id={m.id} status={m.status} />
                  </div>
                </div>
              ))}
            </div>
          );
        })}

      {view === "flat" &&
        rows.map((m: any) => {
        const days = m.orders?.demand_days ?? [];
        const need = m.orders
          ? computeNeed(m.orders, assignedByOrder.get(m.order_id) ?? [])
          : null;
        return (
          <div key={m.id} style={rowStyle}>
            <div style={{ ...cellStyle, width: COL.date }}>
              {days.length > 0 ? (
                <>
                  {formatDayRanges(days)}
                  <span style={{ color: "var(--text-faint)" }}> · {days.length}天</span>
                </>
              ) : (
                <span style={{ color: "var(--text-faint)" }}>没填日期</span>
              )}
            </div>
            {/* 先人后地点，跟聚合视图的订单头一个顺序。
                客户的聊天不放这儿 —— 匹配这一步要联系的是物主，不是客户 */}
            <div style={{ ...cellStyle, width: COL.customer }}>
              {displayName(m.orders?.customers, "-")}
            </div>
            <div style={{ ...cellStyle, width: COL.mtn }}>
              {m.orders?.location || <span style={{ color: "var(--text-faint)" }}>没填</span>}
            </div>
            <div style={{ ...cellStyle, width: COL.party }}>
              {formatParty(m.orders?.male_count, m.orders?.female_count)}
            </div>
            {/* 配齐了标成绿的 —— 那意味着这条意向现在插不进去 */}
            <div
              style={{
                ...cellStyle,
                width: COL.need,
                color: need?.isComplete ? "var(--ok)" : undefined,
              }}
            >
              {need ? formatNeed(need) : "-"}
            </div>
            <div style={{ ...cellStyle, width: COL.ostatus }}>
              {m.orders?.status ? ORDER_STATUS_LABELS[m.orders.status] ?? m.orders.status : "-"}
            </div>
            <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>
              {formatPerson(m.resources?.providers)}
            </div>
            <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }}>
              {m.resources?.holder_name ?? "-"}{" "}
              <span style={{ color: "var(--text-faint)" }}>
                {formatHolder(m.resources?.holder_gender, m.resources?.holder_date_of_birth)}
              </span>
              <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
                {m.resources?.item_type} {formatValidity(m.resources)}
              </div>
            </div>
            <div style={{ ...cellStyle, width: COL.mstatus }}>
              <MatchStatusText status={m.status} stale={staleOf(m)} />
            </div>
            <div style={{ ...cellStyle, width: COL.actions }}>
              <MatchActions id={m.id} status={m.status} />
            </div>
          </div>
        );
      })}

      </div>
      </div>

      {rows.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 14 }}>
          {filtering ? "这些条件下没有意向，把筛选放宽一点。" : "还没有任何匹配意向。"}
        </p>
      )}
    </main>
  );
}


// 跟 /admin/resources 那份一模一样的道理：**宽度必须是 100% + border-box**。
// 写死像素的话控件跟它头上那一列对不齐，列越多错得越远 —— 刚才就是这么歪的。
// 这一行里 input / select / type=date 的自然高度各不相同（实测 22 / 24 / 27）——
// 挨着摆就是一排高低不齐的框。**写死同一个高度**，三种控件才对得齐。
// 26 不是「刚好够」：12px 的字撑开约 15px，26 减掉上下边框和内边距还剩 18，
// 留了 3px 余量（CI 上的字体宽一点也不会被切）
const FILTER_H = 26;
const filterInputStyle: React.CSSProperties = {
  height: FILTER_H,
  padding: "3px 5px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};
const clearFilterStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--link)",
  textDecoration: "none",
};
const actionErrorStyle: React.CSSProperties = {
  color: "var(--danger)",
  fontSize: 13,
  lineHeight: 1.7,
  border: "1px solid var(--danger-soft-border)",
  background: "var(--danger-soft-bg)",
  borderRadius: 6,
  padding: "8px 12px",
};

// 状态格里的内容。两种视图共用一份 —— 「已过期」那个标记只该有一处说法
function MatchStatusText({ status, stale }: { status: string; stale: boolean }) {
  return (
    <>
      {status}
      {/* 库里还写着 proposed，但那一单已经开始了 —— 再也顶不上去了。
          不改库：订单日期还会变，存成字段迟早对不上（见 lib/matchStatus.ts） */}
      {stale && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>已过期</div>}
    </>
  );
}

// 改状态那个表单。同上，两种视图共用一份
function MatchActions({ id, status }: { id: string; status: string }) {
  return (
    <form action={updateMatchStatus} style={{ display: "flex", gap: 6 }}>
      <input type="hidden" name="match_id" value={id} />
      <select name="status" defaultValue={status} style={selectStyle}>
        <option value="proposed">proposed</option>
        <option value="allowed">allowed</option>
        <option value="chosen">chosen</option>
        <option value="unfulfilled">unfulfilled</option>
      </select>
      <button type="submit" style={buttonStyle}>
        更新
      </button>
    </form>
  );
}

// 清筛选：**排序和视图得留着**。排序现在长在筛选表单里，所以「清掉」这个链接
// 得自己把它带上 —— 不然清一下筛选，排序也跟着回默认了
function clearFiltersHref(sp: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  if (sp.sort) q.set("sort", sp.sort);
  if (sp.group) q.set("group", sp.group);
  const qs = q.toString();
  return qs ? `/admin/matches?${qs}` : "/admin/matches";
}

// 日历上点一个块 → 跳到 ?pick=<matchId>，弹一条确认再落。
// 排序、筛选、视图三样原样带着走
function pickHref(
  sp: Record<string, string | undefined>,
  extra?: Record<string, string>
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "pick" || k === "error") continue;
    if (v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const qs = q.toString();
  return qs ? `/admin/matches?${qs}` : "/admin/matches";
}

// 换视图时把现有的筛选和排序原样带上 —— 三件事互不相干
function viewHref(sp: Record<string, string | undefined>, next: MatchView): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "group" || k === "error") continue;
    if (v) q.set(k, v);
  }
  // URL 里只出现**非默认**的那个：默认是日历
  if (next !== "calendar") q.set("group", next);
  const qs = q.toString();
  return qs ? `/admin/matches?${qs}` : "/admin/matches";
}

const groupStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  marginBottom: 10,
  overflow: "hidden",
};
const orderHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 12px",
  background: "var(--surface-2)",
  borderBottom: "1px solid var(--border)",
  fontSize: 13,
};
const candidateRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderBottom: "1px solid var(--border)",
};
const oneLineStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};
const calFormStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
};
const calLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 11,
  color: "var(--text-muted)",
};
const candidatePanelStyle: React.CSSProperties = {
  border: "1px solid var(--notice-border)",
  background: "var(--notice-bg)",
  borderRadius: 8,
  padding: "10px 12px",
  marginTop: 12,
};
const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 10,
};
const segGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  overflow: "hidden",
};
const segStyle: React.CSSProperties = {
  padding: "5px 14px",
  fontSize: 12,
  color: "var(--text-muted)",
  textDecoration: "none",
};
const segActiveStyle: React.CSSProperties = {
  ...segStyle,
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
};
