import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { formatParty } from "@/lib/party";
import { formatHolder } from "@/lib/age";
import { formatDayRanges } from "@/lib/dates";
import { coversOrder } from "@/lib/resourceStatus";

export const dynamic = "force-dynamic";

async function proposeMatch(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);

  const orderId = formData.get("order_id") as string;
  const resourceId = formData.get("resource_id") as string;

  // 只能拿自己的资源去提意向 —— 界面上只列了自己的资源，但服务端必须再校验一次，
  // 不能只靠界面（跟分配那三条校验同一个道理）
  const { data: mine } = await supabase
    .from("resources")
    .select("id")
    .eq("id", resourceId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!mine) redirect("/provider/matches?error=notmine");

  // Provider 从 resource 推得出来，不重复存
  const { error } = await supabase.from("matches").insert({
    order_id: orderId,
    resource_id: resourceId,
    status: "proposed",
  });
  if (error) redirect("/provider/matches?error=save");

  revalidatePath("/admin/matches");
  redirect("/provider/matches?proposed=1");
}

// 物主匹配台：看看有哪些需求能用我手上的资源接。
//
// **看不到客户是谁** —— 姓名和联系方式都不查。物主需要知道的是「几个人、
// 哪几天、去哪个地点、多少钱」，够他判断接不接了；客户是谁跟这个决定无关。
export default async function ProviderMatchesPage({
  searchParams,
}: {
  searchParams: { proposed?: string; error?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);

  const [{ data: resources }, { data: orders }] = await Promise.all([
    supabase.from("resources").select("*").eq("provider_id", providerId).eq("status", "active"),
    supabase
      .from("orders")
      .select("id, location, amount, demand_days, status, male_count, female_count")
      .eq("status", "created")
      .order("created_at", { ascending: false }),
  ]);

  const myResources = resources ?? [];
  // 只列我手上的资源真能覆盖的需求 —— 有效期盖不住那几天的，提了也是白提，
  // 管理员那边分配时一样会被 coversOrder 拒掉
  const openOrders = (orders ?? []).filter((o: any) =>
    myResources.some((s: any) => coversOrder(s, o.demand_days ?? []))
  );

  const errorText: Record<string, string> = {
    notmine: "那个资源不是你的",
    save: "没提交上，再试一次",
  };

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <Link href="/provider" style={{ fontSize: 13, color: "var(--link)" }}>
        ← 我的资源
      </Link>
      <h1 style={{ fontSize: 20 }}>看看有哪些需求</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        下面是还没配到资源、并且你手上的资源有效期能覆盖的需求。觉得能接就提一个意向，
        管理员确认之后才算数。
      </p>

      {searchParams.proposed && (
        <p style={{ color: "var(--ok)", fontSize: 13 }}>已提交意向，等管理员确认。</p>
      )}
      {searchParams.error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>
          {errorText[searchParams.error] ?? "出了点问题，再试一次"}
        </p>
      )}

      {myResources.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 16 }}>
          你名下没有在出租的资源。<Link href="/provider/listing">先去挂一个 →</Link>
        </p>
      ) : openOrders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 16 }}>
          现在没有你的资源能接的需求，过两天再来看看。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {openOrders.map((o: any) => {
            // 这一单能用的资源：有效期真覆盖得住的才列出来
            const usable = myResources.filter((s: any) => coversOrder(s, o.demand_days ?? []));
            return (
              <div key={o.id} style={cardStyle}>
                <div style={{ fontWeight: 500 }}>
                  {formatDayRanges(o.demand_days ?? [])}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                    {" "}
                    · {o.demand_days?.length ?? 0}天
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                  {o.location ? `${o.location} · ` : ""}
                  {formatParty(o.male_count, o.female_count)}
                  {o.amount != null ? ` · $${o.amount}` : ""}
                </div>
                <form
                  action={proposeMatch}
                  style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}
                >
                  <input type="hidden" name="order_id" value={o.id} />
                  <select name="resource_id" style={inputStyle}>
                    {usable.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.holder_name ?? "?"}（
                        {formatHolder(s.holder_gender, s.holder_date_of_birth)}）
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={buttonStyle}>
                    我可以接
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "10px 12px",
};
const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
