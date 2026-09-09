import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { formatDayRanges } from "@/lib/dates";
import { formatHolder } from "@/lib/age";
import { RESOURCE_STATUS_LABELS, isExpired } from "@/lib/resourceStatus";

export const dynamic = "force-dynamic";

// 物主登录后的首页：我挂出去的资源，每张显示被排了哪几天。
//
// **刻意不显示客户是谁。** 物主看得到「9/10~9/12 已排」，但看不到姓名和联系方式 ——
// 那是客户的隐私，也是平台作为中间人的价值。跟客户那边看不到持有人是谁对称。
export default async function ProviderHomePage({
  searchParams,
}: {
  searchParams: { listed?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");

  // 兜底：/auth/callback 里认领失败过的话，这里再补一次
  const providerId = await claimProvider(user.id, user.email ?? null);

  const { data: resources } = await supabase
    .from("resources")
    .select(
      "id, item_type, holder_name, holder_gender, holder_date_of_birth, date_range_start, date_range_end, status"
    )
    .eq("provider_id", providerId)
    .order("date_range_start", { ascending: true });

  // 每个资源被排了哪几天 = 配到这个资源的所有订单的 demand_days 并集。
  // 不存字段，实时算 —— 跟排期总览一个算法。
  // 只查 demand_days，**不查 customer**：物主不该看到客户是谁。
  const resourceIds = (resources ?? []).map((s: any) => s.id);
  const bookedDays = new Map<string, string[]>();
  if (resourceIds.length > 0) {
    const { data: assignments } = await supabase
      .from("order_assignments")
      .select("resource_id, orders(demand_days)")
      .in("resource_id", resourceIds);
    for (const a of assignments ?? []) {
      const days = (a as any).orders?.demand_days ?? [];
      if (days.length === 0) continue;
      bookedDays.set(a.resource_id, [...(bookedDays.get(a.resource_id) ?? []), ...days]);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>我的资源</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" style={signOutStyle}>
            退出
          </button>
        </form>
      </div>
      <p style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{user.email}</p>

      {searchParams.listed && (
        <p style={{ color: "#1f5c33", fontSize: 13, margin: "8px 0 0" }}>
          资源挂上了，有人要租我们会联系你。
        </p>
      )}

      <Link href="/provider/listing" style={primaryLinkStyle}>
        + 挂一个新资源
      </Link>

      {!resources || resources.length === 0 ? (
        <p style={{ marginTop: 20, color: "#666", fontSize: 14 }}>
          你还没挂过资源，点上面那个按钮挂一个。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {resources.map((s: any) => {
            const booked = bookedDays.get(s.id) ?? [];
            const expired = isExpired(s);
            return (
              <div key={s.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {s.holder_name || "（没填持有人）"}
                    <span style={{ fontWeight: 400, color: "#666", fontSize: 13 }}>
                      {" "}
                      {formatHolder(s.holder_gender, s.holder_date_of_birth)}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {s.item_type ?? "-"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
                  有效期 {s.date_range_start} ~ {s.date_range_end}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {booked.length > 0 ? (
                    <span style={{ color: "#1f5c33" }}>
                      已排 {formatDayRanges(booked)}（共 {new Set(booked).size} 天）
                    </span>
                  ) : (
                    <span style={{ color: "#888" }}>还没排出去</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  {RESOURCE_STATUS_LABELS[s.status] ?? s.status}
                  {expired && <span style={{ color: "#a8620d" }}> · 已过有效期</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 12, color: "#999", marginTop: 20, lineHeight: 1.7 }}>
        要改资源信息或者暂停出租，先联系我们 —— 自助编辑还没做。
      </p>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e2e2",
  borderRadius: 6,
  padding: "10px 12px",
};
const primaryLinkStyle: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  padding: "10px 12px",
  background: "#111",
  color: "#fff",
  borderRadius: 4,
  fontSize: 14,
  textAlign: "center",
  textDecoration: "none",
};
const signOutStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: "3px 10px",
  fontSize: 12,
  color: "#666",
  cursor: "pointer",
};
