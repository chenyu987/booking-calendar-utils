import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import ClickOutsideDeselect from "./ClickOutsideDeselect";
import ZoomableCalendar from "./ZoomableCalendar";
import ResizableOrderBlock from "./ResizableOrderBlock";
import OptimisticEditForm from "./OptimisticEditForm";
import NewOrderSelector from "./NewOrderSelector";
import DeleteOrderButton from "./DeleteOrderButton";
import { formatParty } from "@/lib/party";
import { calcAge } from "@/lib/age";
import {
  dateRangeToArray,
  isWeekend,
  todayIso,
  shortLabel,
  contiguousRuns,
  formatDayRanges,
  replaceDayRun,
} from "@/lib/dates";
import { rescaleAmount } from "@/lib/pricing";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import {
  computeNeed,
  findConflictingDays,
  syncedAssignmentStatus,
  formatNeed,
  formatGap,
} from "@/lib/assignment";
import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_LABELS,
  abnormalBadge,
  coversOrder,
} from "@/lib/resourceStatus";
import {
  pageTitleStyle,
  helpTextStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  linkButtonStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

const COL_WIDTH = 132;
const HEADER_ROW_HEIGHT = 52;
// 固定高度要能装下分配模式那 5 行（姓名+金额 / 男女+地点 / 已分配 / 进度 / 状态），
// 非分配模式的 3 行留白垫底，两种状态高度才一样。
// 实测这 5 行内容占 79px，配上下面的 2px 内边距和 2px 行间距，最少要 95px 才不被裁掉
// （色块还有上下各 2px 边框）——96 是压扁的下限，再小「女」那类输入框就会被切。
const ROW_HEIGHT = 80;
const PANEL_WIDTH = 260;
// 一条时间轴拉到底横着能滑很久，改成每 4 周折一段往下排（跟 Excel 里那张排期表一个思路）。
// 段的起点对齐到周一，所以每段正好是 4 个完整自然周。
const DAYS_PER_BAND = 28;
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

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  // 这里不 redirect：server action 里的 redirect 会顺带把跳转目标整页渲染完再返回，
  // 客户端得一路等着（实测 3~5 秒，全程卡在"建单中…"）。改成把新单子 id 还回去，
  // 让客户端自己跳——弹窗可以先关掉，不用对着按钮干等。
  return order.id as string;
}

async function addAssignment(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;
  const resourceId = formData.get("resource_id") as string;

  // 服务端也要校验：订单那几天资源必须有效，不能只靠界面藏按钮
  // 四个查询一次并发拿齐（校验用的 + 算配齐进度用的），插入后就不用再倒回去查一趟
  const [{ data: ord }, { data: sup }, { data: existingRows }, { data: otherAssignments }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("demand_days, male_count, female_count, status")
        .eq("id", orderId)
        .single(),
      supabase
        .from("resources")
        .select("date_range_start, date_range_end, status, holder_name, holder_gender")
        .eq("id", resourceId)
        .single(),
      supabase
        .from("order_assignments")
        .select("resources(holder_gender)")
        .eq("order_id", orderId),
      supabase
        .from("order_assignments")
        .select("orders(demand_days)")
        .eq("resource_id", resourceId)
        .neq("order_id", orderId),
    ]);
  if (!ord || !sup) throw new Error("订单或资源不存在");
  if (sup.status !== "active") throw new Error("这个资源不在出租中");
  if (!coversOrder(sup, ord.demand_days)) {
    throw new Error(
      `${sup.holder_name ?? "这个资源"} 的有效期是 ${sup.date_range_start}~${sup.date_range_end}，覆盖不了这一单的日期`
    );
  }
  // 同一个资源同一天不能配给两个订单
  const bookedDays = (otherAssignments ?? []).flatMap((r: any) => r.orders?.demand_days ?? []);
  const conflictDays = findConflictingDays(ord.demand_days ?? [], bookedDays);
  if (conflictDays.length > 0) {
    throw new Error(
      `${sup.holder_name ?? "这个资源"} 在 ${conflictDays.join("、")} 已经配给别的订单了`
    );
  }

  const { error } = await supabase
    .from("order_assignments")
    .insert({ order_id: orderId, resource_id: resourceId });
  if (error) throw new Error(error.message);

  // 注意：不改 resources.status。资源被占了哪几天是算出来的，不是存出来的。

  // 配齐了就把订单推进到 itemAssigned —— 用插入前已经查到的数据本地算，不用再查一次
  const need = computeNeed(ord, [
    ...(existingRows ?? []).map((r: any) => r.resources),
    { holder_gender: sup.holder_gender },
  ]);
  if (need.isComplete && ord.status === "created") {
    await supabase
      .from("orders")
      .update({ status: "itemAssigned" })
      .eq("id", orderId);
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  redirect(`/admin/overview?assign=${orderId}`);
}

async function resizeOrderRun(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;
  const oldRunStart = formData.get("run_start") as string;
  const oldRunEnd = formData.get("run_end") as string;
  const newStart = formData.get("new_start") as string;
  const newEnd = formData.get("new_end") as string;

  const { data: ord } = await supabase
    .from("orders")
    .select("demand_days, amount")
    .eq("id", orderId)
    .single();
  if (!ord) throw new Error("订单不存在");

  // 只替换被拖的这一段连续日期，订单里其它不连续的日期段保持不动
  const merged = replaceDayRun(ord.demand_days ?? [], oldRunStart, oldRunEnd, newStart, newEnd);

  // 总价跟着天数按比例重算：改天数前的单价（总价/天数）不变，改完乘回新天数
  const newAmount = rescaleAmount(
    ord.amount != null ? Number(ord.amount) : null,
    (ord.demand_days ?? []).length,
    merged.length
  );

  const { error } = await supabase
    .from("orders")
    .update({ demand_days: merged, amount: newAmount })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
}

async function removeAssignment(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;
  const resourceId = formData.get("resource_id") as string;

  const { error } = await supabase
    .from("order_assignments")
    .delete()
    .eq("order_id", orderId)
    .eq("resource_id", resourceId);
  if (error) throw new Error(error.message);

  // 不用改 resources.status —— 删掉这条分配记录，那几天自然就空出来了

  // 撤了这个资源可能就不配齐了，itemAssigned 要回退到 created（人工推进的后续状态不动）
  const [{ data: ord }, { data: rows }] = await Promise.all([
    supabase
      .from("orders")
      .select("male_count, female_count, status")
      .eq("id", orderId)
      .single(),
    supabase
      .from("order_assignments")
      .select("resources(holder_gender)")
      .eq("order_id", orderId),
  ]);
  if (ord) {
    const need = computeNeed(
      ord,
      (rows ?? []).map((r: any) => r.resources)
    );
    const nextStatus = syncedAssignmentStatus(ord.status, need);
    if (nextStatus !== ord.status) {
      await supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
    }
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  redirect(`/admin/overview?assign=${orderId}`);
}

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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: {
    item?: string;
    gender?: string;
    sstatus?: string;
    q?: string;
    assign?: string;
  };
}) {
  const [
    { data: orders, error },
    { data: allResources, error: resourceError },
    { data: assignments },
    { data: allCustomers },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, location, amount, status, demand_days, male_count, female_count, customers(first_name, last_name)"
      ),
    supabase
      .from("resources")
      .select(
        "id, holder_name, holder_gender, holder_date_of_birth, item_type, date_range_start, date_range_end, status"
      )
      .order("date_range_start", { ascending: true }),
    supabase.from("order_assignments").select("order_id, resource_id"),
    // 建新单时用来在客户端直接把姓名换成 customer_id，省掉建单时的那次查询
    // （跟上面几条并行，不额外增加页面加载时间）
    supabase.from("customers").select("id, first_name"),
  ]);

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

  // 左边卡片清单的筛选
  // 挂牌状态默认只看「出租中」——暂停和已下架的平时不该占地方
  const f = {
    item: searchParams.item ?? "",
    gender: searchParams.gender ?? "",
    sstatus: searchParams.sstatus || "active",
    q: (searchParams.q ?? "").trim().toLowerCase(),
  };
  const resources = (allResources ?? []).filter((s: any) => {
    if (f.item && s.item_type !== f.item) return false;
    if (f.gender && s.holder_gender !== f.gender) return false;
    if (f.sstatus !== "all" && s.status !== f.sstatus) return false;
    if (f.q && !(s.holder_name ?? "").toLowerCase().includes(f.q)) return false;
    return true;
  });
  const hasFilter = Boolean(
    f.item || f.gender || f.q || f.sstatus !== "active"
  );
  const resourceTotal = (allResources ?? []).length;

  const withDays = (orders ?? []).filter(
    (o: any) => o.demand_days && o.demand_days.length > 0
  );

  const allDays = withDays.flatMap((o: any) => o.demand_days).sort();

  const shiftDay = (iso: string, delta: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

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

    // 起点先往前留两天，再退到那一周的周一（getUTCDay：0=周日），这样每段都从周一开始
    const firstPadded = shiftDay(earliest, -2);
    const backToMonday = (new Date(`${firstPadded}T00:00:00Z`).getUTCDay() + 6) % 7;
    const start = shiftDay(firstPadded, -backToMonday);
    let end = shiftDay(latest, 10);
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
  const totalRevenue = withDays.reduce(
    (sum: number, o: any) =>
      o.status === "cancelled" || o.status === "refunded"
        ? sum
        : sum + Number(o.amount ?? 0),
    0
  );
  const notFullyAssigned = withDays.filter(
    (o: any) => !computeNeed(o, assignedTo.get(o.id) ?? []).isComplete
  ).length;

  const assigningOrder = searchParams.assign
    ? withDays.find((o: any) => o.id === searchParams.assign)
    : null;
  const assigningNeed = assigningOrder
    ? computeNeed(assigningOrder, assignedTo.get((assigningOrder as any).id) ?? [])
    : null;

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (f.item) p.set("item", f.item);
    if (f.gender) p.set("gender", f.gender);
    if (f.sstatus !== "active") p.set("sstatus", f.sstatus); // active 是默认，不写进 URL
    if (f.q) p.set("q", f.q);
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
      <p style={helpTextStyle}>
        一人一个资源，男的配男资源、女的配女资源。点订单色块开始分配。
        <span style={{ color: "#c47712" }}>橙色列是周末</span>。
      </p>

      <div style={{ display: "flex", gap: 24, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label="订单数" value={String(withDays.length)} />
        <Stat label="流水（不含取消/退款）" value={`$${totalRevenue.toLocaleString()}`} />
        <Stat
          label="未配齐"
          value={String(notFullyAssigned)}
          highlight={notFullyAssigned > 0}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
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
      </div>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <ResourcePanel
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

        <div style={{ flex: 1, minWidth: 0 }}>
          {timeline.length === 0 ? (
            <p style={{ color: "#666" }}>
              还没有带日期的订单。去 <Link href="/admin/orders">Order 管理</Link> 建一个。
            </p>
          ) : (
            <ZoomableCalendar>
              {bands.map((band, bandIdx) => (
              <div
                key={band.days[0]}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${band.days.length}, ${COL_WIDTH}px)`,
                  gridTemplateRows: `${HEADER_ROW_HEIGHT}px`,
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
                {band.days.map((d, i) => {
                  const { date, weekday } = shortLabel(d);
                  const weekend = isWeekend(d);
                  return (
                    <div
                      key={d}
                      // 新开标签页时用来定位到"今天"那一列
                      data-today={d === today ? "1" : undefined}
                      style={{
                        gridRow: 1,
                        gridColumn: i + 1,
                        padding: "4px 6px",
                        background: weekend ? "#fdefdb" : "#fafafa",
                        borderBottom:
                          d === today ? "2px solid #333" : "1px solid #e5e5e5",
                        fontSize: 12,
                        color: weekend ? "#a8620d" : "#666",
                        // 竖着滚的时候日期条黏在顶上，不然滚下去就不知道是哪天了。
                        // zIndex 要压过订单色块（1）和空白选框（0）
                        position: "sticky",
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{date}</div>
                      <div style={{ fontSize: 11 }}>{weekday}</div>
                    </div>
                  );
                })}

                {(sorted as any[]).map((o) => {
                  // 这一段（4 周）里没有这个单子的日子就整个跳过
                  const bandLane = band.laneOf.get(o.id);
                  if (bandLane === undefined) return null;
                  const cards = assignedTo.get(o.id) ?? [];
                  const need = computeNeed(o, cards);
                  const isAssigning = searchParams.assign === o.id;
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
                      border: isAssigning
                        ? "2px solid #1c4e78"
                        : `1px solid ${c.border}`,
                      color: c.text,
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 12,
                      overflow: "hidden",
                      lineHeight: 1.3,
                      // 空白处的新建选框也是这个 grid 的一员，没有这两条订单色块会被它盖住点不到
                      position: "relative",
                      zIndex: 1,
                    } as const;
                    const blockTitle = [
                      `${o.customers?.first_name ?? ""} ${o.customers?.last_name ?? ""}`,
                      `${o.location ?? "?"} · ${formatParty(o.male_count, o.female_count)} · ${o.demand_days.length}天`,
                      `$${o.amount ?? "?"} · ${STATUS_LABELS[o.status] ?? o.status}`,
                      `分配 ${formatNeed(need)}（${formatGap(need)}）`,
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
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    fontWeight: 500,
                                  }}
                                >
                                  {o.customers?.first_name ?? "?"}{" "}
                                  {formatParty(o.male_count, o.female_count)}
                                  {o.location ? ` · ${o.location}` : ""}
                                </span>
                                <span style={{ fontSize: 11, opacity: 0.8, flexShrink: 0 }}>
                                  ${o.amount ?? "?"}
                                </span>
                              </div>
                              <div
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontSize: 11,
                                  opacity: 0.85,
                                }}
                              >
                                {cards.length > 0
                                  ? cards
                                      .map(
                                        (s: any) =>
                                          `${s.holder_gender === "male" ? "♂" : "♀"}${s.holder_name}`
                                      )
                                      .join(" ")
                                  : "未分配"}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: need.isComplete ? "#1f5c33" : "#a8620d",
                                }}
                              >
                                {formatNeed(need)}
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
                          style={blockStyle}
                          title={blockTitle}
                        />
                      );
                    }

                    // 分配模式：点名字那行退出，已配的资源直接在色块里叉掉；左右边框可以拖，改这一段的起止日期
                    const editInner = (
                      <div
                        id="assign-active-block"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          // 行间距和上下内边距都收到 2px：色块压扁之后这 5 行才塞得下
                          gap: 2,
                          height: "100%",
                          boxSizing: "border-box",
                          padding: "2px 6px",
                          fontSize: 12,
                          lineHeight: 1.3,
                          overflow: "hidden",
                        }}
                        title={blockTitle}
                      >
                        {showEdit && (
                          <>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: 4,
                              }}
                            >
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                style={{ display: "flex", flex: 1, minWidth: 0 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <input
                                  name="customer_name"
                                  defaultValue={o.customers?.first_name ?? ""}
                                  data-original={o.customers?.first_name ?? ""}
                                  style={{
                                    width: "100%",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    padding: "0 2px",
                                    color: "inherit",
                                    background: "transparent",
                                    border: "1px solid transparent",
                                  }}
                                />
                              </OptimisticEditForm>
                              <DeleteOrderButton
                                orderId={o.id}
                                deleteAction={deleteOrder}
                                exitHref={qs({ assign: "" })}
                                style={{ flexShrink: 0 }}
                              />
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <span style={{ fontSize: 11 }}>$</span>
                                <input
                                  name="amount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  defaultValue={o.amount ?? ""}
                                  data-original={o.amount ?? ""}
                                  style={{ width: 52, fontSize: 11, padding: "0 2px", color: "#222" }}
                                />
                              </OptimisticEditForm>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                              }}
                            >
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                ♂
                                <input
                                  name="male_count"
                                  type="number"
                                  min="0"
                                  defaultValue={o.male_count}
                                  data-original={o.male_count}
                                  style={{
                                    width: 22,
                                    fontSize: 11,
                                    padding: "0 1px",
                                    color: "inherit",
                                    background: "transparent",
                                    border: "1px solid transparent",
                                  }}
                                />
                                ♀
                                <input
                                  name="female_count"
                                  type="number"
                                  min="0"
                                  defaultValue={o.female_count}
                                  data-original={o.female_count}
                                  style={{
                                    width: 22,
                                    fontSize: 11,
                                    padding: "0 1px",
                                    color: "inherit",
                                    background: "transparent",
                                    border: "1px solid transparent",
                                  }}
                                />
                              </OptimisticEditForm>
                              <OptimisticEditForm
                                exitHref={qs({ assign: "" })}
                                style={{ display: "flex", flex: 1, minWidth: 0 }}
                              >
                                <input type="hidden" name="order_id" value={o.id} />
                                <input
                                  name="location"
                                  placeholder="地点"
                                  defaultValue={o.location ?? ""}
                                  data-original={o.location ?? ""}
                                  style={{
                                    width: "100%",
                                    fontSize: 11,
                                    padding: "0 2px",
                                    color: "inherit",
                                    background: "transparent",
                                    border: "1px solid transparent",
                                  }}
                                />
                              </OptimisticEditForm>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                fontSize: 11,
                                opacity: 0.9,
                              }}
                            >
                              {cards.length > 0
                                ? cards.map((s: any) => (
                                    <form
                                      key={s.id}
                                      action={removeAssignment}
                                      style={{ display: "inline" }}
                                    >
                                      <input type="hidden" name="order_id" value={o.id} />
                                      <input type="hidden" name="resource_id" value={s.id} />
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 2,
                                        }}
                                      >
                                        {s.holder_gender === "male" ? "♂" : "♀"}
                                        {s.holder_name}
                                        <button
                                          type="submit"
                                          title="撤销这个资源"
                                          style={{
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            marginLeft: 1,
                                            cursor: "pointer",
                                            color: "inherit",
                                            fontSize: 11,
                                            lineHeight: 1,
                                          }}
                                        >
                                          ×
                                        </button>
                                      </span>
                                    </form>
                                  ))
                                : "未分配"}
                            </div>
                            {/* 进度和状态并排放一行：进度字很短，右边本来就空着。
                                分成两行的话色块压到 80px 高就装不下，状态框会被裁掉 */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 4,
                                marginTop: "auto",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: need.isComplete ? "#1f5c33" : "#a8620d",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatNeed(need)}
                              </span>
                            <OptimisticEditForm
                              exitHref={qs({ assign: "" })}
                              style={{
                                display: "flex",
                                gap: 4,
                                flexShrink: 0,
                              }}
                            >
                              <input type="hidden" name="order_id" value={o.id} />
                              <select
                                name="status"
                                defaultValue={o.status}
                                data-original={o.status}
                                style={{
                                  fontSize: 11,
                                  padding: "1px 2px",
                                  color: "#222",
                                  minWidth: 0,
                                }}
                              >
                                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                  <option key={key} value={key}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </OptimisticEditForm>
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
                        runStart={run[0]}
                        runEnd={run[run.length - 1]}
                        startIndex={start}
                        length={seg.length}
                        timeline={band.days}
                        laneRow={bandLane + 2}
                        resizeAction={resizeOrderRun}
                        style={{
                          background: c.bg,
                          border: "2px solid #1c4e78",
                          color: c.text,
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        {editInner}
                      </ResizableOrderBlock>
                    );
                  });
                })}
              </div>
              ))}
            </ZoomableCalendar>
          )}
        </div>
      </div>

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
  resources,
  filters,
  hasFilter,
  total,
  loadError,
  bookedDays,
  assigningOrder,
  assigningNeed,
  alreadyAssigned,
}: {
  resources: any[];
  filters: { item: string; gender: string; sstatus: string; q: string };
  hasFilter: boolean;
  total: number;
  loadError?: string;
  bookedDays: Map<string, string[]>;
  assigningOrder: any;
  assigningNeed: any;
  alreadyAssigned: Set<string>;
}) {
  const male = resources.filter((s) => s.holder_gender === "male");
  const female = resources.filter((s) => s.holder_gender === "female");
  const other = resources.filter(
    (s) => s.holder_gender !== "male" && s.holder_gender !== "female"
  );

  return (
    <aside id="resource-panel" style={{ width: PANEL_WIDTH, flexShrink: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        资源 Resource（
        {resources.length === total ? total : `${resources.length} / ${total}`}）
      </div>

      {loadError && (
        <p
          style={{
            color: "crimson",
            fontSize: 12,
            border: "1px solid #eab3aa",
            background: "#fbe9e7",
            borderRadius: 4,
            padding: 8,
          }}
        >
          读取资源失败：{loadError}
        </p>
      )}

      <form
        method="GET"
        style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}
      >
        {assigningOrder && (
          <input type="hidden" name="assign" value={assigningOrder.id} />
        )}
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="搜持有人姓名"
          style={{ ...inputStyle, width: "100%" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <select
            name="item"
            defaultValue={filters.item}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">全部资源</option>
            <option value="beta">beta</option>
            <option value="alpha">alpha</option>
          </select>
          <select
            name="gender"
            defaultValue={filters.gender}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">男女不限</option>
            <option value="male">男资源</option>
            <option value="female">女资源</option>
          </select>
        </div>
        <select
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" style={buttonStyle}>
            筛选
          </button>
          {hasFilter && (
            <Link href="/admin/overview" style={linkButtonStyle}>
              清除
            </Link>
          )}
        </div>
      </form>

      {resources.length === 0 ? (
        <p style={{ color: "#888", fontSize: 13 }}>
          {hasFilter ? "没有符合条件的资源。" : "还没挂资源。"}
        </p>
      ) : (
        <>
          <ResourceGroup
            title="男资源"
            symbol="♂"
            list={male}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            gap={assigningNeed?.maleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
          />
          <ResourceGroup
            title="女资源"
            symbol="♀"
            list={female}
            bookedDays={bookedDays}
            assigningOrder={assigningOrder}
            gap={assigningNeed?.femaleGap ?? 0}
            alreadyAssigned={alreadyAssigned}
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
            />
          )}
        </>
      )}
    </aside>
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
}: {
  title: string;
  symbol: string;
  list: any[];
  bookedDays: Map<string, string[]>;
  assigningOrder: any;
  gap: number;
  alreadyAssigned: Set<string>;
}) {
  if (list.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: "#888",
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {symbol} {title}（{list.length}）
        </span>
        {assigningOrder && gap > 0 && (
          <span style={{ color: "#a8620d" }}>还差 {gap} 张</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((s) => {
          const isAssigned = alreadyAssigned.has(s.id);
          const booked = [...new Set(bookedDays.get(s.id) ?? [])].sort();
          const badge = abnormalBadge(s);
          const listingOk = s.status === "active";
          // 卡在「订单那几天」有效即可，跟今天过没过期无关
          const covers =
            assigningOrder && coversOrder(s, assigningOrder.demand_days);
          // 同一个资源同一天不能给两个订单用
          const conflictDays = assigningOrder
            ? assigningOrder.demand_days.filter((d: string) => booked.includes(d))
            : [];
          const canAssign =
            assigningOrder &&
            !isAssigned &&
            listingOk &&
            gap > 0 &&
            covers &&
            conflictDays.length === 0;

          return (
            <div
              key={s.id}
              style={{
                border: `1px solid ${isAssigned ? "#a8d5b5" : "#e5e5e5"}`,
                borderRadius: 6,
                padding: "8px 10px",
                background: isAssigned ? "#f2f9f4" : "#fff",
              }}
            >
              <Link
                href={`/admin/resources?edit=${s.id}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 500,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.holder_name ?? "（未填持有人）"}
                  </span>
                  <span style={{ fontSize: 11, color: "#888", flexShrink: 0 }}>
                    {s.item_type ?? "?"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {calcAge(s.holder_date_of_birth) ?? "?"}岁
                  {s.holder_date_of_birth ? ` · ${s.holder_date_of_birth}` : ""}
                </div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
                  有效期 {s.date_range_start} ~ {s.date_range_end}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span style={{ color: booked.length > 0 ? "#1c4e78" : "#bbb" }}>
                    {booked.length > 0 ? `已排 ${formatDayRanges(booked)}` : "未排期"}
                  </span>
                  {badge && (
                    <span style={{ flexShrink: 0, color: badge.color }}>
                      {badge.text}
                    </span>
                  )}
                </div>
              </Link>

              {assigningOrder && (
                <div style={{ marginTop: 6 }}>
                  {isAssigned ? (
                    <span style={{ fontSize: 11, color: "#1f5c33" }}>✓ 已配给这单</span>
                  ) : canAssign ? (
                    <form action={addAssignment}>
                      <input type="hidden" name="order_id" value={assigningOrder.id} />
                      <input type="hidden" name="resource_id" value={s.id} />
                      <button
                        type="submit"
                        style={{
                          ...buttonStyle,
                          padding: "3px 10px",
                          fontSize: 11,
                          background: "#1f5c33",
                        }}
                      >
                        配这单
                      </button>
                    </form>
                  ) : (
                    <span style={{ fontSize: 11, color: "#bbb" }}>
                      {!listingOk
                        ? (badge?.text ?? "不可用")
                        : gap === 0
                          ? "这个性别已配齐"
                          : !covers
                            ? `订单日期超出有效期（${s.date_range_start}~${s.date_range_end}）`
                            : `${formatDayRanges(conflictDays)} 已被占用`}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: highlight ? "#a8620d" : "#222",
        }}
      >
        {value}
      </div>
    </div>
  );
}
