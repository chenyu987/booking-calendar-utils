import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { formatParty } from "@/lib/party";
import { formatHolder } from "@/lib/age";
import {
  computeNeed,
  extraAssignmentReason,
  findConflictingDays,
} from "@/lib/assignment";
import { coversOrder, itemConflictReason } from "@/lib/resourceStatus";
import {
  formStyle,
  selectStyle,
  buttonStyle,
  tableStyle,
  thStyle,
  tdStyle,
  pageTitleStyle,
  helpTextStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

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

  const { error: updateError } = await supabase
    .from("matches")
    .update({ status: newStatus })
    .eq("id", matchId);
  if (updateError) throw new Error(updateError.message);

  // chosen：把这个资源加到订单的分配里（一个订单可以配多张，1男1女要两张）
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
        .select("id, date_range_start, date_range_end, status, holder_name, holder_gender, item_type")
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
    if (!ord || !sup) throw new Error("订单或资源不存在");
    if (sup.status !== "active") throw new Error("这个资源不在出租中");
    // 配多了 / 配重了，跟排期总览那条路径同一个判断
    const already = (alreadyRows ?? []).map((r: any) => r.resources).filter(Boolean);
    const extra = extraAssignmentReason(ord, already, sup);
    if (extra) throw new Error(extra);
    // 类型要能进这个地点，跟排期总览那条路径同一个判断
    const itemConflict = itemConflictReason(sup, ord.location);
    if (itemConflict) throw new Error(itemConflict);
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

    await supabase
      .from("order_assignments")
      .insert({ order_id: match.order_id, resource_id: match.resource_id });

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

  revalidatePath("/admin/matches");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/");
}

export default async function MatchesAdminPage() {
  const [{ data: matches, error }, { data: orders }, { data: resources }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          "id, status, created_at, order_id, resource_id, orders(location, male_count, female_count, customers(first_name)), resources(item_type, holder_name, holder_gender, holder_date_of_birth, date_range_start, date_range_end, providers(first_name, last_name, chat))"
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
        .eq("status", "active"),
    ]);

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
              {s.item_type} {s.date_range_start}~{s.date_range_end} ·{" "}
              {s.providers?.first_name ?? ""}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          创建匹配
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Order</th>
            <th style={thStyle}>Provider</th>
            <th style={thStyle}>Resource</th>
            <th style={thStyle}>状态</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {matches?.map((m: any) => (
            <tr key={m.id}>
              <td style={tdStyle}>
                {m.orders?.location} / {m.orders?.customers?.first_name} /{" "}
                {formatParty(m.orders?.male_count, m.orders?.female_count)}
              </td>
              <td style={tdStyle}>
                {m.resources?.providers?.first_name} {m.resources?.providers?.last_name} (
                {m.resources?.providers?.chat})
              </td>
              <td style={tdStyle}>
                {m.resources?.holder_name ?? "-"}{" "}
                <span style={{ color: "#888" }}>
                  {formatHolder(
                    m.resources?.holder_gender,
                    m.resources?.holder_date_of_birth
                  )}
                </span>
                <br />
                <span style={{ color: "#888", fontSize: 12 }}>
                  {m.resources?.item_type} {m.resources?.date_range_start}~
                  {m.resources?.date_range_end}
                </span>
              </td>
              <td style={tdStyle}>{m.status}</td>
              <td style={tdStyle}>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
