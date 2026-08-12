import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { formatParty } from "@/lib/party";
import { calcAge } from "@/lib/age";
import {
  dateRangeToArray,
  isWeekend,
  todayIso,
  shortLabel,
  contiguousRuns,
  formatDayRanges,
} from "@/lib/dates";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { computeNeed, formatNeed, formatGap } from "@/lib/assignment";
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
const ROW_HEIGHT = 52;
const PANEL_WIDTH = 260;

async function addAssignment(formData: FormData) {
  "use server";
  const orderId = formData.get("order_id") as string;
  const resourceId = formData.get("resource_id") as string;

  // 服务端也要校验：订单那几天资源必须有效，不能只靠界面藏按钮
  const [{ data: ord }, { data: sup }] = await Promise.all([
    supabase.from("orders").select("demand_days").eq("id", orderId).single(),
    supabase
      .from("resources")
      .select("date_range_start, date_range_end, status, holder_name")
      .eq("id", resourceId)
      .single(),
  ]);
  if (!ord || !sup) throw new Error("订单或资源不存在");
  if (sup.status !== "active") throw new Error("这个资源不在出租中");
  if (!coversOrder(sup, ord.demand_days)) {
    throw new Error(
      `${sup.holder_name ?? "这个资源"} 的有效期是 ${sup.date_range_start}~${sup.date_range_end}，覆盖不了这一单的日期`
    );
  }

  const { error } = await supabase
    .from("order_assignments")
    .insert({ order_id: orderId, resource_id: resourceId });
  if (error) throw new Error(error.message);

  // 注意：不改 resources.status。资源被占了哪几天是算出来的，不是存出来的。

  // 配齐了就把订单推进到 itemAssigned
  const [{ data: order }, { data: rows }] = await Promise.all([
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
  const need = computeNeed(
    order,
    (rows ?? []).map((r: any) => r.resources)
  );
  if (need.isComplete && order?.status === "created") {
    await supabase
      .from("orders")
      .update({ status: "itemAssigned" })
      .eq("id", orderId);
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  redirect(`/admin/overview?assign=${orderId}`);
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

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  redirect(`/admin/overview?assign=${orderId}`);
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
  ]);

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
  let timeline: string[] = [];
  if (allDays.length > 0) {
    const pad = (iso: string, delta: number) => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    };
    timeline = dateRangeToArray(
      pad(allDays[0], -2),
      pad(allDays[allDays.length - 1], 2)
    );
  }
  const colIndex = new Map(timeline.map((d, i) => [d, i]));

  const lanes: string[][] = [];
  const laneOf = new Map<string, number>();
  const sorted = [...withDays].sort((a: any, b: any) =>
    a.demand_days[0] < b.demand_days[0] ? -1 : 1
  );
  for (const o of sorted as any[]) {
    let lane = 0;
    while (lanes[lane] && lanes[lane].some((d) => o.demand_days.includes(d))) {
      lane += 1;
    }
    lanes[lane] = [...(lanes[lane] ?? []), ...o.demand_days];
    laneOf.set(o.id, lane);
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

      {assigningOrder && assigningNeed && (
        <div
          style={{
            padding: "10px 14px",
            background: assigningNeed.isComplete ? "#e6f4e9" : "#e3f0fb",
            border: `1px solid ${assigningNeed.isComplete ? "#a8d5b5" : "#a9cdeb"}`,
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
            color: assigningNeed.isComplete ? "#1f5c33" : "#1c4e78",
          }}
        >
          <div>
            正在分配：
            <strong>
              {(assigningOrder as any).customers?.first_name}{" "}
              {formatParty(
                (assigningOrder as any).male_count,
                (assigningOrder as any).female_count
              )}
              {" · "}
              {(assigningOrder as any).location}
            </strong>
            {" —— "}
            {formatNeed(assigningNeed)}，{formatGap(assigningNeed)}
            <Link href={qs({ assign: "" })} style={{ marginLeft: 12, color: "inherit" }}>
              完成
            </Link>
          </div>

          {(assignedTo.get((assigningOrder as any).id) ?? []).length > 0 && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12 }}>已配：</span>
              {(assignedTo.get((assigningOrder as any).id) ?? []).map((s: any) => (
                <span
                  key={s.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    border: "1px solid #cfd8e0",
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontSize: 12,
                  }}
                >
                  {s.holder_gender === "male" ? "♂" : "♀"} {s.holder_name}
                  <form action={removeAssignment}>
                    <input
                      type="hidden"
                      name="order_id"
                      value={(assigningOrder as any).id}
                    />
                    <input type="hidden" name="resource_id" value={s.id} />
                    <button
                      type="submit"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#a33",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 12,
                      }}
                    >
                      ×
                    </button>
                  </form>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
            <div style={{ overflowX: "auto", paddingBottom: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${timeline.length}, ${COL_WIDTH}px)`,
                  gridAutoRows: `${ROW_HEIGHT}px`,
                  gap: 2,
                  minWidth: "min-content",
                }}
              >
                {timeline.map((d, i) => {
                  const { date, weekday } = shortLabel(d);
                  const weekend = isWeekend(d);
                  return (
                    <div
                      key={d}
                      style={{
                        gridRow: 1,
                        gridColumn: i + 1,
                        padding: "4px 6px",
                        background: weekend ? "#fdefdb" : "#fafafa",
                        borderBottom:
                          d === today ? "2px solid #333" : "1px solid #e5e5e5",
                        fontSize: 12,
                        color: weekend ? "#a8620d" : "#666",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{date}</div>
                      <div style={{ fontSize: 11 }}>{weekday}</div>
                    </div>
                  );
                })}

                {(sorted as any[]).map((o) => {
                  const cards = assignedTo.get(o.id) ?? [];
                  const need = computeNeed(o, cards);
                  const isAssigning = searchParams.assign === o.id;
                  return contiguousRuns(o.demand_days).map((run, runIdx) => {
                    const start = colIndex.get(run[0]);
                    if (start === undefined) return null;
                    const c = statusColor(o.status);
                    return (
                      <Link
                        key={`${o.id}-${runIdx}`}
                        href={qs({ assign: isAssigning ? "" : o.id })}
                        style={{
                          gridRow: (laneOf.get(o.id) ?? 0) + 2,
                          gridColumn: `${start + 1} / span ${run.length}`,
                          background: c.bg,
                          border: isAssigning
                            ? "2px solid #1c4e78"
                            : `1px solid ${c.border}`,
                          color: c.text,
                          borderRadius: 4,
                          padding: "3px 6px",
                          fontSize: 12,
                          overflow: "hidden",
                          textDecoration: "none",
                          display: "block",
                          lineHeight: 1.3,
                        }}
                        title={[
                          `${o.customers?.first_name ?? ""} ${o.customers?.last_name ?? ""}`,
                          `${o.location ?? "?"} · ${formatParty(o.male_count, o.female_count)} · ${o.demand_days.length}天`,
                          `$${o.amount ?? "?"} · ${STATUS_LABELS[o.status] ?? o.status}`,
                          `分配 ${formatNeed(need)}（${formatGap(need)}）`,
                          ...cards.map(
                            (s: any) =>
                              `　${s.holder_gender === "male" ? "♂" : "♀"} ${s.holder_name}（${calcAge(s.holder_date_of_birth) ?? "?"}岁 ${s.item_type ?? ""}）`
                          ),
                        ].join("\n")}
                      >
                        {runIdx === 0 && (
                          <>
                            <div
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
                  });
                })}
              </div>
            </div>
          )}
        </div>
      </div>
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
    <aside style={{ width: PANEL_WIDTH, flexShrink: 0 }}>
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
