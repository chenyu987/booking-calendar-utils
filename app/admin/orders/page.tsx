import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { formatParty } from "@/lib/party";
import { computeNeed, formatNeed } from "@/lib/assignment";
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
  searchParams: { edit?: string };
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
        <input name="location" placeholder="地点" style={inputStyle} />
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
        <div style={{ ...cellStyle, width: 70 }}>金额</div>
        <div style={{ ...cellStyle, flex: 1.4 }}>已分分配</div>
        <div style={{ ...cellStyle, width: 120 }}>状态</div>
        <div style={{ ...cellStyle, width: 110 }}>操作</div>
      </div>

      {orders?.map((o: any) =>
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
              <input
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
            <div style={{ ...cellStyle, width: 70 }}>
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
            <div style={{ ...cellStyle, flex: 1 }}>{o.location ?? "-"}</div>
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
            <div style={{ ...cellStyle, width: 70 }}>{o.amount ?? "-"}</div>
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
