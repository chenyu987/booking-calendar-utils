import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { formatDayRanges, todayIso } from "@/lib/dates";
import { formatParty } from "@/lib/party";
import { RESOURCE_EDIT_ERRORS } from "@/lib/resourceEdit";
import { matchDisplay, isOpenMatch } from "@/lib/matchStatus";
import { buildProviderBoard } from "@/lib/providerBoard";
import { bookedDaysFor } from "./data";
import { saveContact } from "./actions";
import DemandCalendar, { ProposeConfirm } from "./DemandCalendar";
import ResourceList from "./ResourceList";

export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  ...RESOURCE_EDIT_ERRORS,
  save: "没存上，再试一次。",
  chat: "账号得填 —— 我们是通过聊天联系你的。",
  notmine: "那个资源不是你的。",
  dup: "这一单你已经提过意向了，等管理员确认就行。",
  blocked: "这一单现在接不了了 —— 可能刚被别人接走，或者日期改了。刷新看看。",
};

// 物主的**唯一落脚点**。原来是两页（这一页管资源，/provider/matches 管看需求），
// 来回跳。现在合成一页：上面是日历（主要动作：找活儿、提意向），下面是「我的」
// （提过的意向、我的资源、联系方式）。/provider/matches 重定向到这儿。
//
// **刻意不显示客户是谁。** 物主看得到「9/10~9/12 已排」，但看不到姓名和联系方式 ——
// 那是客户的隐私，也是平台作为中间人的价值。跟客户那边看不到持有人是谁对称。
export default async function ProviderHomePage({
  searchParams,
}: {
  searchParams: {
    listed?: string;
    edit?: string;
    saved?: string;
    error?: string;
    card?: string;
    propose?: string;
    proposed?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");

  // 兜底：/auth/callback 里认领失败过的话，这里再补一次
  const providerId = await claimProvider(user.id, user.email ?? null);

  const [{ data: me }, { data: resources }] = await Promise.all([
    supabase
      .from("providers")
      .select("first_name, phone_number, chat")
      .eq("id", providerId)
      .maybeSingle(),
    supabase
      .from("resources")
      .select(
        "id, item_type, holder_name, holder_gender, holder_date_of_birth, date_range_start, date_range_end, status"
      )
      .eq("provider_id", providerId)
      .order("date_range_start", { ascending: true }),
  ]);

  const myResources = resources ?? [];
  const resourceIds = myResources.map((s: any) => s.id);

  // 只查还在找资源的单子。**不查 customers，也不查 amount** —— 不是查出来再藏，是根本不查。
  // 金额是客户付给平台的总价，不是物主拿的钱，给他看只会当成收入预期。
  const [{ data: orders }, bookedByResource, { data: myMatches }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, location, demand_days, male_count, female_count")
      .eq("status", "created"),
    bookedDaysFor(resourceIds),
    resourceIds.length > 0
      ? supabase
          .from("matches")
          .select(
            "id, status, created_at, order_id, resource_id, orders(location, demand_days, male_count, female_count), resources(holder_name)"
          )
          .in("resource_id", resourceIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // 这些单已经配上了哪些资源 —— 只用来算「还差男资源还是女资源」，持有人是谁不显示
  const orderIds = (orders ?? []).map((o: any) => o.id);
  const assignedByOrder = new Map<string, { id?: string; holder_gender?: string | null }[]>();
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_assignments")
      .select("order_id, resources(id, holder_gender)")
      .in("order_id", orderIds);
    for (const a of data ?? []) {
      const s = (a as any).resources;
      if (!s) continue;
      assignedByOrder.set(a.order_id, [...(assignedByOrder.get(a.order_id) ?? []), s]);
    }
  }

  // 日历只看在出租的资源。**资源选择器是个筛选，不是必选其一** —— 默认「全部资源」，
  // 因为一单常常好几个资源都能接，排开才看得出「这单我哪几张都行」。
  const activeResources = myResources.filter((s: any) => s.status === "active");
  const card = activeResources.some((s: any) => s.id === searchParams.card)
    ? (searchParams.card as string)
    : "";
  const boardResources = card ? activeResources.filter((s: any) => s.id === card) : activeResources;

  const board = buildProviderBoard({
    today: todayIso(),
    resources: boardResources,
    orders: orders ?? [],
    assignedByOrder,
    bookedByResource,
    // 已经提过的用**全部**意向算，不跟着筛选走：换个资源看的时候不该又变回「可提」
    proposed: new Set(
      (myMatches ?? [])
        .filter((m: any) => isOpenMatch(m.status) || m.status === "chosen")
        .map((m: any) => `${m.order_id}:${m.resource_id}`)
    ),
  });

  const editing = searchParams.edit;
  const errorText = searchParams.error ? ERROR_TEXT[searchParams.error] ?? "出了点问题，再试一次。" : null;

  const [pendingOrder, pendingResource] = (searchParams.propose ?? "").split(":");
  const pendingBlock = board.rows
    .find((r) => r.resourceId === pendingResource)
    ?.lanes.flat()
    .find((b) => b.orderId === pendingOrder);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={headRowStyle}>
        <h1 style={{ fontSize: 20, margin: 0 }}>我的资源</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" style={signOutStyle}>
            退出
          </button>
        </form>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>{user.email}</p>

      {searchParams.listed && (
        <p style={okStyle}>资源挂上了，有人要租我们会联系你。</p>
      )}
      {searchParams.proposed && <p style={okStyle}>已提交意向，等管理员确认。</p>}
      {searchParams.saved && !editing && <p style={okStyle}>已保存</p>}
      {errorText && !editing && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{errorText}</p>
      )}

      <section style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle}>看看有哪些需求</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          每一行是你的一个资源。蓝色是已经排出去的，虚线框是你这个资源接得了的需求 ——
          有效期盖得住、那几天没占着、缺的正好是你这个资源的性别。
          点一下提个意向，管理员确认之后才算数。
        </p>

        {pendingBlock && (
          <ProposeConfirm
            block={pendingBlock}
            resourceName={
              (myResources.find((s: any) => s.id === pendingResource) as any)?.holder_name ?? "这个资源"
            }
            orderId={pendingOrder}
            resourceId={pendingResource}
            card={card}
          />
        )}

        {activeResources.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 14 }}>
            你名下没有在出租的资源，先挂一个才能接需求。
          </p>
        ) : (
          <DemandCalendar
            board={board}
            // **传全部在出租的资源，不是筛过的那张** —— 芯片行要靠它才画得出来。
            // 传筛过的话，一收窄到某个资源，选择器自己就没了，回不到「全部资源」。
            resources={activeResources}
            card={card}
            propose={searchParams.propose ?? ""}
          />
        )}
      </section>

      <hr style={dividerStyle} />

      <section>
        <h2 style={sectionTitleStyle}>我提过的意向</h2>
        {(myMatches ?? []).length === 0 ? (
          <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>
            还没提过。上面看到能接的点一下就行。
          </p>
        ) : (
          <ul style={listStyle}>
            {(myMatches ?? []).map((m: any) => {
              const d = matchDisplay(m.status);
              const o = m.orders;
              return (
                <li key={m.id} style={listItemStyle}>
                  <span style={{ fontSize: 13 }}>
                    {o ? formatDayRanges(o.demand_days ?? []) : "—"}
                    <span style={{ color: "var(--text-muted)" }}>
                      {o?.location ? ` · ${o.location}` : ""}
                      {o ? ` · ${formatParty(o.male_count, o.female_count)}` : ""}
                      {" · 用 "}
                      {m.resources?.holder_name ?? "?"}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: d.color, flexShrink: 0 }} title={d.hint}>
                    {d.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 22 }}>
        <div style={headRowStyle}>
          <h2 style={sectionTitleStyle}>我的资源</h2>
          <Link href="/provider/listing" style={{ fontSize: 13, color: "var(--link)" }}>
            + 挂一个新资源
          </Link>
        </div>
        <ResourceList
          resources={myResources}
          bookedDays={bookedByResource}
          editing={editing}
          errorText={editing && editing !== "contact" ? errorText : null}
        />
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.7 }}>
          改完马上生效。要整张删掉，或者要把有效期改到盖不住已排的日子，先联系我们。
        </p>
      </section>

      <section style={{ marginTop: 22 }}>
        <div style={headRowStyle}>
          <h2 style={sectionTitleStyle}>联系方式</h2>
          {editing !== "contact" && (
            <Link href="/provider?edit=contact" style={{ fontSize: 13, color: "var(--link)" }}>
              编辑
            </Link>
          )}
        </div>

        {editing === "contact" && errorText && (
          <p style={{ fontSize: 13, color: "var(--danger)", margin: "0 0 8px" }}>{errorText}</p>
        )}

        {editing === "contact" ? (
          <form action={saveContact} style={formStyle}>
            <label style={labelStyle}>
              称呼
              <input name="first_name" defaultValue={me?.first_name ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              账号 *
              <input name="chat" required defaultValue={me?.chat ?? ""} style={inputStyle} />
            </label>
            <p style={{ fontSize: 12, color: "var(--warn)", margin: 0 }}>
              重要：有人要租你的资源，我们是通过聊天联系你的 —— 没有聊天就通知不到你。
            </p>
            <label style={labelStyle}>
              手机号
              <input
                name="phone_number"
                type="tel"
                defaultValue={me?.phone_number ?? ""}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/provider" style={cancelStyle}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <dl style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.9 }}>
            <Row label="称呼" value={me?.first_name} />
            <Row label="账号" value={me?.chat} />
            <Row label="手机号" value={me?.phone_number} />
            {!me?.chat && (
              <p style={{ fontSize: 12, color: "var(--warn)", margin: "6px 0 0" }}>
                账号还没填 —— 有人要租你的资源我们是通过聊天找你的，
                <Link href="/provider?edit=contact" style={{ color: "var(--warn)" }}>
                  现在补一下 →
                </Link>
              </p>
            )}
          </dl>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ color: "var(--text-faint)", width: 56, flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0 }}>
        {value || <span style={{ color: "var(--text-faint)" }}>未填</span>}
      </dd>
    </div>
  );
}

const headRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  margin: "0 0 6px",
};
const dividerStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--border)",
  margin: "24px 0 18px",
};
const okStyle: React.CSSProperties = {
  color: "var(--ok)",
  fontSize: 13,
  margin: "8px 0 0",
};
const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  border: "1px solid var(--border)",
  borderRadius: 6,
};
const listItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "9px 12px",
  borderBottom: "1px solid var(--border)",
};
const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--text-muted)",
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
const cancelStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
  color: "var(--text-muted)",
  textDecoration: "none",
};
const signOutStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  padding: "3px 10px",
  fontSize: 12,
  color: "var(--text-muted)",
  cursor: "pointer",
};
