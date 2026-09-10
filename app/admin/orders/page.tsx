import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import LocationInput from "@/components/LocationInput";
import { isUnknownLocation, locationHintFor } from "@/lib/locations";
import { formatParty } from "@/lib/party";
import { computeNeed, formatNeed } from "@/lib/assignment";
import { STATUS_LABELS } from "@/lib/orderStatus";
import {
  parseOrderFilters,
  hasAnyFilter,
  matchesOrderFilters,
} from "@/lib/orderFilter";
import FilterForm from "./FilterForm";
import {
  dateRangeToArray,
  parseDaysInput,
  formatDaysInput,
} from "@/lib/dates";
import {
  formStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  pageTitleStyle,
  helpTextStyle,
  rowStyle,
  headerRowStyle,
  cellStyle,
  linkButtonStyle,
  dangerLinkStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

// 筛选行的控件比新增表单里的紧凑：8 列挤在一行，每格只有几十像素。
// boxSizing 不能少——inputStyle 带内边距和边框，默认 content-box 的话
// width:100% 会比同格的 <select>（浏览器默认 border-box）宽出十几像素，右边对不齐。
const filterInputStyle = {
  ...inputStyle,
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "3px 5px",
  fontSize: 12,
};

const ORDER_STATUSES = [
  "created",
  "itemAssigned",
  "pendingPickUp",
  "pendingPayment",
  "complete",
  "cancelled",
  "refunded",
];

async function createOrder(formData: FormData) {
  "use server";
  const customerId = formData.get("customer_id") as string;
  if (!customerId) throw new Error("必须选一个 Customer");

  const start = formData.get("start_date") as string;
  const end = formData.get("end_date") as string;
  const days = dateRangeToArray(start, end);
  if (days.length === 0) throw new Error("日期区间不对");

  const male = Number(formData.get("male_count") ?? 0);
  const female = Number(formData.get("female_count") ?? 0);
  if (male + female < 1) throw new Error("至少要有一个人");

  const pricePerDay = formData.get("price_per_day")
    ? Number(formData.get("price_per_day"))
    : 40;

  const { error } = await supabase.from("orders").insert({
    customer_id: customerId,
    location: (formData.get("location") as string)?.trim() || null,
    male_count: male,
    female_count: female,
    demand_days: days,
    amount: pricePerDay * days.length * (male + female),
    status: "created",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/overview");
}

async function updateOrder(formData: FormData) {
  "use server";
  const days = parseDaysInput((formData.get("demand_days") as string) ?? "");
  if (days.length === 0) throw new Error("日期不能为空，格式：2026-12-24, 2026-12-25");

  const { error } = await supabase
    .from("orders")
    .update({
      customer_id: formData.get("customer_id") as string,
      location: (formData.get("location") as string)?.trim() || null,
      male_count: Number(formData.get("male_count") ?? 0),
      female_count: Number(formData.get("female_count") ?? 0),
      demand_days: days,
      amount: formData.get("amount") ? Number(formData.get("amount")) : null,
      status: formData.get("status") as string,
    })
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/orders");
  revalidatePath("/admin/overview");
  revalidatePath("/");
  redirect("/admin/orders");
}

async function deleteOrder(formData: FormData) {
  "use server";
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/overview");
  revalidatePath("/");
}

export default async function OrdersAdminPage({
  searchParams,
}: {
  // 逐列筛选全走 URL 参数，跟 ?edit= 一个路子：能收藏、能分享、刷新不丢
  searchParams: {
    edit?: string;
    customer?: string;
    location?: string;
    party?: string;
    from?: string;
    to?: string;
    min?: string;
    max?: string;
    assign?: string;
    status?: string;
  };
}) {
  const [
    { data: orders, error },
    { data: customers },
    { data: resources },
    { data: assignments },
  ] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id, first_name, last_name"),
    supabase
      .from("resources")
      .select(
        "id, holder_name, holder_gender, holder_date_of_birth, item_type, date_range_start, date_range_end"
      ),
    supabase.from("order_assignments").select("order_id, resource_id"),
  ]);

  const resourceById = new Map((resources ?? []).map((s: any) => [s.id, s]));
  const assignedTo = new Map<string, any[]>();
  for (const a of assignments ?? []) {
    const s = resourceById.get(a.resource_id);
    if (!s) continue;
    assignedTo.set(a.order_id, [...(assignedTo.get(a.order_id) ?? []), s]);
  }

  const editingId = searchParams.edit;

  const customerName = (id: string) => {
    const r = customers?.find((x: any) => x.id === id);
    return r ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : "-";
  };

  // 逐列筛选。在内存里筛不写进 SQL：一季 150~250 单，全捞回来才几十 KB；
  // 而"配齐没配齐"是算出来的、日期是数组要判交集，写成 SQL 既别扭又容易跟
  // 界面上的算法走偏（判断规则统一放在 lib/orderFilter.ts，有单测）。
  const filters = parseOrderFilters(searchParams);
  const filtering = hasAnyFilter(filters);
  const visibleOrders = (orders ?? []).filter((o: any) => {
    const cards = assignedTo.get(o.id) ?? [];
    const need = computeNeed(o, cards);
    return matchesOrderFilters(
      {
        customerName: customerName(o.customer_id),
        location: o.location,
        maleCount: o.male_count ?? 0,
        femaleCount: o.female_count ?? 0,
        demandDays: o.demand_days ?? [],
        amount: o.amount ?? null,
        status: o.status,
        assignedCount: cards.length,
        isComplete: need.isComplete,
      },
      filters
    );
  });
  return (
    <main>
      <h1 style={pageTitleStyle}>Order 管理</h1>
      <p style={helpTextStyle}>
        新增时金额按「单价 × 天数 × 人数」自动算。编辑时日期用逗号分隔，不连续的天也能填，
        比如 <code>2026-12-24, 2026-12-25, 2026-12-27</code>。
      </p>

      <form action={createOrder} style={formStyle}>
        <select name="customer_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Customer *
          </option>
          {customers?.map((r: any) => (
            <option key={r.id} value={r.id}>
              {r.first_name} {r.last_name}
            </option>
          ))}
        </select>
        <LocationInput name="location" placeholder="地点" style={inputStyle} />
        <input
          name="male_count"
          type="number"
          min={0}
          defaultValue={0}
          title="男几人"
          style={{ ...inputStyle, width: 62 }}
        />
        <input
          name="female_count"
          type="number"
          min={0}
          defaultValue={0}
          title="女几人"
          style={{ ...inputStyle, width: 62 }}
        />
        <input name="start_date" type="date" required style={inputStyle} />
        <input name="end_date" type="date" required style={inputStyle} />
        <input
          name="price_per_day"
          type="number"
          placeholder="单价40"
          style={{ ...inputStyle, width: 84 }}
        />
        <button type="submit" style={buttonStyle}>
          新增 Order
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, flex: 1 }}>Customer</div>
        <div style={{ ...cellStyle, flex: 1 }}>地点</div>
        <div style={{ ...cellStyle, width: 70 }}>人数</div>
        <div style={{ ...cellStyle, flex: 1.6 }}>日期</div>
        <div style={{ ...cellStyle, width: 130 }}>金额</div>
        <div style={{ ...cellStyle, flex: 1.4 }}>已分分配</div>
        <div style={{ ...cellStyle, width: 120 }}>状态</div>
        <div style={{ ...cellStyle, width: 110 }}>操作</div>
      </div>

      {/* 逐列筛选：控件的 flex/width 跟上面表头一一对齐，看起来就是表头下面的一行。
          常驻显示，不做收起——它只占一行，藏起来反而多一次点击。
          也没有「筛选」按钮：改一个条件就自动筛，见 FilterForm。 */}
      <FilterForm action="/admin/orders">
        <div style={{ ...rowStyle, background: "#fafafa" }}>
            <div style={{ ...cellStyle, flex: 1 }}>
              <input
                name="customer"
                defaultValue={filters.customer}
                placeholder="客人姓名"
                style={filterInputStyle}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1 }}>
              <LocationInput
                name="location"
                defaultValue={filters.location}
                placeholder="地点"
                style={filterInputStyle}
              />
            </div>
            <div style={{ ...cellStyle, width: 70 }}>
              <select name="party" defaultValue={filters.party} style={filterInputStyle}>
                <option value="">全部</option>
                <option value="male">有男</option>
                <option value="female">有女</option>
                <option value="both">男女都有</option>
              </select>
            </div>
            {/* 起止两个日期并排一行，中间一个「~」，读起来就是「什么时间到什么时间」 */}
            <div style={{ ...cellStyle, flex: 1.6, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="date"
                name="from"
                defaultValue={filters.from}
                title="从这天起"
                style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
              />
              <span style={{ color: "#999", flexShrink: 0 }}>~</span>
              <input
                type="date"
                name="to"
                defaultValue={filters.to}
                title="到这天止"
                style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
              />
            </div>
            {/* 金额同理并排。这一格只有 70px，放不下 placeholder，靠 title 说明 */}
            <div style={{ ...cellStyle, width: 130, display: "flex", alignItems: "center", gap: 2 }}>
              <input
                // 用 text 不用 number：number 会带上下箭头，靠 CSS 干掉那个
                // vendor 伪元素在不同浏览器上不一定都生效。text + inputMode=numeric
                // 根本不会画箭头，手机上还是数字键盘。非数字的输入由
                // lib/orderFilter 那边当"没填"处理。
                type="text"
                inputMode="numeric"
                name="min"
                defaultValue={filters.minAmount}
                title="最低金额"
                placeholder="最低"
                style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
              />
              <span style={{ color: "#999", flexShrink: 0, fontSize: 11 }}>~</span>
              <input
                // 用 text 不用 number：number 会带上下箭头，靠 CSS 干掉那个
                // vendor 伪元素在不同浏览器上不一定都生效。text + inputMode=numeric
                // 根本不会画箭头，手机上还是数字键盘。非数字的输入由
                // lib/orderFilter 那边当"没填"处理。
                type="text"
                inputMode="numeric"
                name="max"
                defaultValue={filters.maxAmount}
                title="最高金额"
                placeholder="最高"
                style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1.4 }}>
              <select name="assign" defaultValue={filters.assign} style={filterInputStyle}>
                <option value="">全部</option>
                <option value="none">未分配</option>
                <option value="partial">配了一半</option>
                <option value="full">已配齐</option>
              </select>
            </div>
            <div style={{ ...cellStyle, width: 120 }}>
              <select name="status" defaultValue={filters.status} style={filterInputStyle}>
                <option value="">全部状态</option>
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st] ?? st}
                  </option>
                ))}
              </select>
            </div>
          {/* 「清除」放在这一格：收起壳子拿掉之后，它是唯一能一键复位的入口 */}
          <div
            style={{
              ...cellStyle,
              width: 110,
              color: "#999",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {filtering ? (
              <>
                <span style={{ color: "#a8620d" }}>{visibleOrders.length} 单</span>
                <Link href="/admin/orders" style={linkButtonStyle}>
                  清除
                </Link>
              </>
            ) : (
              "选完自动筛"
            )}
          </div>
        </div>
      </FilterForm>

      {filtering && visibleOrders.length === 0 && (
        <p style={{ ...helpTextStyle, margin: "6px 0" }}>
          共 {orders?.length ?? 0} 单，没有符合条件的——放宽一点试试
        </p>
      )}

      {visibleOrders.map((o: any) =>
        o.id === editingId ? (
          <form key={o.id} action={updateOrder} style={rowStyle}>
            <input type="hidden" name="id" value={o.id} />
            <div style={{ ...cellStyle, flex: 1 }}>
              <select
                name="customer_id"
                defaultValue={o.customer_id}
                style={{ ...selectStyle, width: "100%" }}
              >
                {customers?.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.first_name} {r.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...cellStyle, flex: 1 }}>
              <LocationInput
                name="location"
                defaultValue={o.location ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 70, display: "flex", gap: 3 }}>
              <input
                name="male_count"
                type="number"
                min={0}
                defaultValue={o.male_count ?? 0}
                title="男"
                style={{ ...inputStyle, width: "50%" }}
              />
              <input
                name="female_count"
                type="number"
                min={0}
                defaultValue={o.female_count ?? 0}
                title="女"
                style={{ ...inputStyle, width: "50%" }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1.6 }}>
              <input
                name="demand_days"
                defaultValue={formatDaysInput(o.demand_days)}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 130 }}>
              <input
                name="amount"
                type="number"
                step="0.01"
                defaultValue={o.amount ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1.4, color: "#888", fontSize: 11 }}>
              分配请去
              <br />
              排期总览
            </div>
            <div style={{ ...cellStyle, width: 120 }}>
              <select
                name="status"
                defaultValue={o.status}
                style={{ ...selectStyle, width: "100%" }}
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...cellStyle, width: 110, display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/admin/orders" style={linkButtonStyle}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <div key={o.id} style={rowStyle}>
            <div style={{ ...cellStyle, flex: 1 }}>{customerName(o.customer_id)}</div>
            <div style={{ ...cellStyle, flex: 1 }}>
              {o.location ? (
                // 库里认不出来就标红 —— 跟排期总览一个规则，**不自动改**
                <LocationCell value={o.location} />
              ) : (
                "-"
              )}
            </div>
            <div style={{ ...cellStyle, width: 70 }}>
              {formatParty(o.male_count, o.female_count)}
            </div>
            <div style={{ ...cellStyle, flex: 1.6, color: "#555" }}>
              {o.demand_days?.length ?? 0} 天
              <span style={{ color: "#999", marginLeft: 6, fontSize: 12 }}>
                {o.demand_days?.[0]}
                {o.demand_days?.length > 1
                  ? ` ~ ${o.demand_days[o.demand_days.length - 1]}`
                  : ""}
              </span>
            </div>
            <div style={{ ...cellStyle, width: 130 }}>{o.amount ?? "-"}</div>
            <div style={{ ...cellStyle, flex: 1.4, color: "#555" }}>
              {(() => {
                const cards = assignedTo.get(o.id) ?? [];
                const need = computeNeed(o, cards);
                return (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: need.isComplete ? "#1f5c33" : "#a8620d",
                      }}
                    >
                      {formatNeed(need)}
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      {cards.length > 0
                        ? cards
                            .map(
                              (s: any) =>
                                `${s.holder_gender === "male" ? "♂" : "♀"}${s.holder_name ?? "?"}`
                            )
                            .join(" ")
                        : "未分配"}
                    </div>
                  </>
                );
              })()}
            </div>
            <div style={{ ...cellStyle, width: 120 }}>{o.status}</div>
            <div style={{ ...cellStyle, width: 110, display: "flex", gap: 10 }}>
              <Link href={`/admin/orders?edit=${o.id}`} style={linkButtonStyle}>
                编辑
              </Link>
              <form action={deleteOrder}>
                <input type="hidden" name="id" value={o.id} />
                <button type="submit" style={dangerLinkStyle}>
                  删除
                </button>
              </form>
            </div>
          </div>
        )
      )}
    </main>
  );
}

/** 地点名单元格：库里认不出来就标红并提示，改不改是人的事 */
function LocationCell({ value }: { value: string }) {
  if (!isUnknownLocation(value)) return <>{value}</>;
  return (
    <span
      title={locationHintFor(value)}
      style={{
        color: "#c0392b",
        fontWeight: 600,
        textDecoration: "underline wavy #c0392b",
        textUnderlineOffset: 2,
        cursor: "help",
      }}
    >
      {value}
    </span>
  );
}
