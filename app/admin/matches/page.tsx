import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatParty } from "@/lib/party";
import { formatHolder } from "@/lib/age";
import Link from "next/link";
import { assignBlockReason } from "@/lib/assignable";
import { computeNeed, formatNeed } from "@/lib/assignment";
import { formatDayRanges } from "@/lib/dates";
import { MATCH_SORTS, firstDay, parseMatchSort, sortMatches, type MatchSort } from "@/lib/matchSort";
import { isStaleMatch } from "@/lib/matchStatus";
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
  // 两个日期框要并排放得下（量出来的，见筛选行那条注释）
  date: 252,
  mtn: 110,
  customer: 100,
  party: 104,
  need: 116,
  ostatus: 96,
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
          "id, date_range_start, date_range_end, status, deleted_at, holder_name, holder_gender, item_type"
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
  const filtering = hasAnyMatchFilter(filters);
  const [{ data: matches, error }, { data: orders }, { data: resources }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          "id, status, created_at, order_id, resource_id, orders(location, demand_days, status, male_count, female_count, customers(first_name)), resources(item_type, holder_name, holder_gender, holder_date_of_birth, date_range_start, date_range_end, providers(first_name, last_name, chat))"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, location, male_count, female_count")
        .in("status", ["created", "itemAssigned"]),
      supabase
        .from("resources")
        .select(
          "id, item_type, holder_name, holder_gender, holder_date_of_birth, date_range_start, date_range_end, providers(first_name, last_name)"
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
  // 落空与否**现算不存**：到了订单开始那天还没被选中就再也用不上了。
  // 在那之前留着当后备 —— 中标的那条可能退单，其余几条随时能顶上去。见 lib/matchStatus.ts
  const staleOf = (m: any) => isStaleMatch(m.status, firstDay(m), today);

  const all = sortMatches((matches ?? []) as any[], sort);
  const rows = all.filter((m: any) => {
    const need = m.orders ? computeNeed(m.orders, assignedByOrder.get(m.order_id) ?? []) : null;
    return matchesMatchFilters(
      {
        matchStatus: m.status,
        orderStatus: m.orders?.status ?? null,
        location: m.orders?.location ?? null,
        customerName: m.orders?.customers?.first_name ?? null,
        providerName: [m.resources?.providers?.first_name, m.resources?.providers?.last_name]
          .filter(Boolean)
          .join(" "),
        holderName: m.resources?.holder_name ?? null,
        days: m.orders?.demand_days ?? [],
        isComplete: need ? need.isComplete : null,
        stale: staleOf(m),
      },
      filters
    );
  });

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
              {s.providers?.first_name ?? ""}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          创建匹配
        </button>
      </form>
      {error && <p style={{ color: "var(--danger)" }}>{error.message}</p>}
      {searchParams.error && <p style={actionErrorStyle}>没改成：{searchParams.error}</p>}

      {/* 表头 + 紧贴其下的逐列筛选行。
          这一页原来是真 <table>，而 <form> 塞不进表格结构里 —— 所以改成跟
          /admin/resources 一样的 div 布局：筛选控件的 flex/width 跟表头一一对齐，
          就是表头下面的一行。FilterForm 跟 Order / Resource 两页共用：
          改一个条件就自动筛，空值不拼进 URL。 */}
      {/* 十列在笔记本或窄窗口下放不下。让表格**在自己这块地里横滑**，
          而不是把列挤到文字抖行（或者把整页撑出一条横条，那样侧边栏和标题也跟着跑）。
          之前包在 <table> 外面的那层，改成 div 布局时丢了。 */}
      <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: MIN_TABLE_WIDTH }}>
      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, width: COL.date }}>
          日期{" "}
          {(Object.keys(MATCH_SORTS) as MatchSort[]).map((k) => (
            <Link
              key={k}
              // 换排序不该把筛选清掉 —— 两件事互不相干
              href={sortHref(searchParams, k)}
              style={k === sort ? sortActiveStyle : sortLinkStyle}
              title={MATCH_SORTS[k]}
            >
              {k === "date" ? "近↑" : k === "dateDesc" ? "远↓" : "新"}
            </Link>
          ))}
        </div>
        <div style={{ ...cellStyle, width: COL.mtn }}>地点</div>
        <div style={{ ...cellStyle, width: COL.customer }}>客户</div>
        <div style={{ ...cellStyle, width: COL.party }}>人数</div>
        <div style={{ ...cellStyle, width: COL.need }}>分配进度</div>
        <div style={{ ...cellStyle, width: COL.ostatus }}>订单状态</div>
        <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>Provider</div>
        <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }}>Resource</div>
        <div style={{ ...cellStyle, width: COL.mstatus }}>状态</div>
        <div style={{ ...cellStyle, width: COL.actions }}>操作</div>
      </div>

      <FilterForm action="/admin/matches">
        <div style={{ ...rowStyle, background: "var(--surface-2)" }}>
          {/* 排序不是筛选，但得跟着一起带走，不然一筛就跳回默认排序 */}
          <input type="hidden" name="sort" value={sort === "date" ? "" : sort} />
          {/* 两个日期框并排。列宽是**量出来的**：在浏览器里撑一个 type=date 到
              内容最小宽度是 112px（年/月/日 + 那个小日历图标）。
              两个框是弹性的（各占一半），所以列宽 252 → 每个 124，比最小宽度多 12px。
              300 那一版每个框 148px，框里「年/月/日」右边空出一大截，很难看；
              框又不能缩到 112 以下，所以列宽就按「刚好让框接近自然宽度」来定。
              **不能再窄**：弹性项缩不到内容最小宽度以下，再窄就会溢出到隔壁列。 */}
          <div style={{ ...cellStyle, width: COL.date, display: "flex", gap: 4 }}>
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
          </div>
          <div style={{ ...cellStyle, width: COL.mtn }}>
            <select name="mtn" defaultValue={filters.mtn} style={filterInputStyle}>
              <option value="">全部</option>
              {LOCATION_OPTIONS.filter(
                (m) => !filters.region || m.region === filters.region
              ).map((m) => (
                <option key={m.value} value={m.value} title={m.hint}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...cellStyle, width: COL.customer }}>
            <input
              name="customer"
              defaultValue={filters.customer}
              placeholder="客户"
              style={filterInputStyle}
            />
          </div>
          {/* 人数那列没什么好筛的，拿来放区域 —— 它跟地点是一对，挨着才好用 */}
          <div style={{ ...cellStyle, width: COL.party }}>
            <select name="region" defaultValue={filters.region} style={filterInputStyle}>
              <option value="">全部区域</option>
              {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...cellStyle, width: COL.need }}>
            <select name="gap" defaultValue={filters.gap} style={filterInputStyle}>
              {(Object.keys(GAP_FILTER_LABELS) as GapFilter[]).map((k) => (
                <option key={k} value={k}>
                  {GAP_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...cellStyle, width: COL.ostatus }}>
            <select name="ostatus" defaultValue={filters.ostatus} style={filterInputStyle}>
              <option value="">全部</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/* 物主和持有人一个框一起搜 —— 找人的时候没人分得清自己记住的是哪一个。
              框放在 Provider 那列，横跨 Provider + Resource 两列的意思 */}
          <div style={{ ...cellStyle, flex: 1.2, minWidth: COL.providerMin }}>
            <input
              name="resource"
              defaultValue={filters.resource}
              placeholder="物主 / 持有人"
              style={filterInputStyle}
            />
          </div>
          <div style={{ ...cellStyle, flex: 1.6, minWidth: COL.resourceMin }} />
          <div style={{ ...cellStyle, width: COL.mstatus }}>
            <select name="mstatus" defaultValue={filters.mstatus} style={filterInputStyle}>
              {(Object.keys(MATCH_STATUS_FILTER_LABELS) as MatchStatusFilter[]).map((k) => (
                <option key={k} value={k}>
                  {MATCH_STATUS_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              ...cellStyle,
              width: COL.actions,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {filtering && (
              <>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {rows.length}/{all.length}
                </span>
                <Link href={sortHref({ sort: searchParams.sort }, sort)} style={clearFilterStyle}>
                  清掉
                </Link>
              </>
            )}
          </div>
        </div>
      </FilterForm>

      {rows.map((m: any) => {
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
            <div style={{ ...cellStyle, width: COL.mtn }}>
              {m.orders?.location || <span style={{ color: "var(--text-faint)" }}>没填</span>}
            </div>
            <div style={{ ...cellStyle, width: COL.customer }}>
              {m.orders?.customers?.first_name ?? "-"}
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
              {m.resources?.providers?.first_name} {m.resources?.providers?.last_name} (
              {m.resources?.providers?.chat})
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
              {m.status}
              {/* 库里还写着 proposed，但那一单已经开始了 —— 再也顶不上去了。
                  不改库：订单日期还会变，存成字段迟早对不上（见 lib/matchStatus.ts） */}
              {staleOf(m) && (
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>已过期</div>
              )}
            </div>
            <div style={{ ...cellStyle, width: COL.actions }}>
              <form action={updateMatchStatus} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="match_id" value={m.id} />
                <select name="status" defaultValue={m.status} style={selectStyle}>
                  <option value="proposed">proposed</option>
                  <option value="allowed">allowed</option>
                  <option value="chosen">chosen</option>
                  <option value="unfulfilled">unfulfilled</option>
                </select>
                <button type="submit" style={buttonStyle}>
                  更新
                </button>
              </form>
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

// 换排序时把现有的筛选原样带上。**空值不拼进去** —— 不然地址栏一长串
// ?customer=&mtn=&from= 的空参数，跟 FilterForm 那边的做法保持一致
function sortHref(sp: Record<string, string | undefined>, next: MatchSort): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "sort" || k === "error") continue;
    if (v) q.set(k, v);
  }
  if (next !== "date") q.set("sort", next);
  const qs = q.toString();
  return qs ? `/admin/matches?${qs}` : "/admin/matches";
}

// 跟 /admin/resources 那份一模一样的道理：**宽度必须是 100% + border-box**。
// 写死像素的话控件跟它头上那一列对不齐，列越多错得越远 —— 刚才就是这么歪的。
const filterInputStyle: React.CSSProperties = {
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
const sortLinkStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: "var(--text-faint)",
  textDecoration: "none",
  marginLeft: 5,
};
const sortActiveStyle: React.CSSProperties = {
  ...sortLinkStyle,
  color: "var(--link)",
  fontWeight: 600,
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
