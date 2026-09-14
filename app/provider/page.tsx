import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { formatDayRanges } from "@/lib/dates";
import { formatHolder } from "@/lib/age";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  formatValidity,
  isExpired,
} from "@/lib/resourceStatus";
import { validateResourceEdit, RESOURCE_EDIT_ERRORS } from "@/lib/resourceEdit";

export const dynamic = "force-dynamic";

// 每个资源被排了哪几天 = 配到这个资源的所有订单的 demand_days 并集。
// 不存字段，实时算 —— 跟排期总览一个算法。
// 只查 demand_days，**不查 customer**：物主不该看到客户是谁。
async function bookedDaysFor(resourceIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (resourceIds.length === 0) return map;
  const { data } = await supabase
    .from("order_assignments")
    .select("resource_id, orders(demand_days)")
    .in("resource_id", resourceIds);
  for (const a of data ?? []) {
    const days = (a as any).orders?.demand_days ?? [];
    if (days.length === 0) continue;
    map.set(a.resource_id, [...(map.get(a.resource_id) ?? []), ...days]);
  }
  return map;
}

const text = (formData: FormData, k: string) =>
  ((formData.get(k) as string) ?? "").trim();

// 物主自助改资源信息。校验在 lib/resourceEdit.ts，**服务端拦**——
// 界面上性别禁掉了、日期给了 min/max，但那些 curl 一下全绕得过去。
async function saveResource(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);
  const id = formData.get("id") as string;

  // **认 provider_id，不是只认 id**：只按 id 更新的话，换个 id 就能改别人的资源。
  const { data: current } = await supabase
    .from("resources")
    .select("id, holder_gender")
    .eq("id", id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!current) redirect("/provider");

  const next = {
    itemType: text(formData, "item_type"),
    holderName: text(formData, "holder_name"),
    holderGender: text(formData, "holder_gender"),
    dateRangeStart: text(formData, "date_range_start"),
    dateRangeEnd: text(formData, "date_range_end"),
    status: text(formData, "status"),
  };
  const booked = (await bookedDaysFor([id])).get(id) ?? [];
  const bad = validateResourceEdit(next, current, booked);
  if (bad) redirect(`/provider?edit=${id}&error=${bad}`);

  const { error } = await supabase
    .from("resources")
    .update({
      item_type: next.itemType,
      holder_name: next.holderName,
      holder_gender: next.holderGender,
      holder_date_of_birth: text(formData, "holder_date_of_birth") || null,
      // 留空 = 这一头不设限，别写成空字符串
      date_range_start: next.dateRangeStart || null,
      date_range_end: next.dateRangeEnd || null,
      status: next.status,
    })
    .eq("id", id)
    .eq("provider_id", providerId);
  if (error) redirect(`/provider?edit=${id}&error=save`);

  revalidatePath("/provider");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/resources");
  redirect("/provider?saved=1");
}

// 联系方式。**聊天必填** —— 配到客户之后全靠聊天找人，没有聊天这个资源就等于挂不出去。
async function saveContact(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);

  const chat = text(formData, "chat");
  if (!chat) redirect("/provider?edit=contact&error=chat");

  const { error } = await supabase
    .from("providers")
    .update({
      first_name: text(formData, "first_name") || null,
      chat,
      phone_number: text(formData, "phone_number") || null,
    })
    .eq("id", providerId);
  if (error) redirect("/provider?edit=contact&error=save");

  revalidatePath("/provider");
  revalidatePath("/admin/providers");
  redirect("/provider?saved=1");
}

const ERROR_TEXT: Record<string, string> = {
  ...RESOURCE_EDIT_ERRORS,
  save: "没存上，再试一次。",
  chat: "账号得填 —— 我们是通过聊天联系你的。",
};

// 物主登录后的首页：我挂出去的资源，每张显示被排了哪几天，点「编辑」就地改。
//
// **刻意不显示客户是谁。** 物主看得到「9/10~9/12 已排」，但看不到姓名和联系方式 ——
// 那是客户的隐私，也是平台作为中间人的价值。跟客户那边看不到持有人是谁对称。
export default async function ProviderHomePage({
  searchParams,
}: {
  searchParams: { listed?: string; edit?: string; saved?: string; error?: string };
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

  const bookedDays = await bookedDaysFor((resources ?? []).map((s: any) => s.id));

  // 编辑态用 URL 参数切换，不用 useState —— 跟 admin 那几个列表页一个路子
  const editing = searchParams.edit;
  const errorText = searchParams.error ? ERROR_TEXT[searchParams.error] : null;

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
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>{user.email}</p>

      {searchParams.listed && (
        <p style={{ color: "var(--ok)", fontSize: 13, margin: "8px 0 0" }}>
          资源挂上了，有人要租我们会联系你。
        </p>
      )}
      {searchParams.saved && !editing && (
        <p style={{ color: "var(--ok)", fontSize: 13, margin: "8px 0 0" }}>已保存</p>
      )}

      <section style={cardStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={{ fontSize: 14, margin: 0, color: "var(--text-muted)" }}>联系方式</h2>
          {editing !== "contact" && (
            <Link href="/provider?edit=contact" style={editLinkStyle}>
              编辑
            </Link>
          )}
        </div>

        {editing === "contact" && errorText && <p style={errorStyle}>{errorText}</p>}

        {editing === "contact" ? (
          <form action={saveContact} style={formStyle}>
            <label style={labelStyle}>
              称呼
              <input name="first_name" defaultValue={me?.first_name ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              账号 *
              <input
                name="chat"
                required
                defaultValue={me?.chat ?? ""}
                style={inputStyle}
              />
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

      <Link href="/provider/listing" style={primaryLinkStyle}>
        + 挂一个新资源
      </Link>

      {!resources || resources.length === 0 ? (
        <p style={{ marginTop: 20, color: "var(--text-muted)", fontSize: 14 }}>
          你还没挂过资源，点上面那个按钮挂一个。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {resources.map((s: any) => {
            const booked = [...new Set(bookedDays.get(s.id) ?? [])].sort();
            const expired = isExpired(s);
            if (editing === s.id) {
              return (
                <ResourceEditForm
                  key={s.id}
                  resource={s}
                  booked={booked}
                  errorText={errorText}
                />
              );
            }
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
                    <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>
                      {" "}
                      {formatHolder(s.holder_gender, s.holder_date_of_birth)}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.item_type ?? "-"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                  有效期 {formatValidity(s)}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {booked.length > 0 ? (
                    <span style={{ color: "var(--ok)" }}>
                      已排 {formatDayRanges(booked)}（共 {booked.length} 天）
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>还没排出去</span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--text-faint)",
                    marginTop: 4,
                  }}
                >
                  <span>
                    {RESOURCE_STATUS_LABELS[s.status] ?? s.status}
                    {expired && <span style={{ color: "var(--warn)" }}> · 已过有效期</span>}
                  </span>
                  <Link href={`/provider?edit=${s.id}`} style={editLinkStyle}>
                    编辑
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 20, lineHeight: 1.7 }}>
        改完马上生效。要整张删掉，或者要把有效期改到盖不住已排的日子，先联系我们。
      </p>
    </main>
  );
}

// 编辑态。已经排出去的资源有两处受限：性别不给改、有效期不能缩到盖不住已排的日子。
// 界面上禁掉/给 min-max 只是省得白填一遍，真正拦住的是 saveResource 里那道校验。
function ResourceEditForm({
  resource: s,
  booked,
  errorText,
}: {
  resource: any;
  booked: string[];
  errorText: string | null;
}) {
  const hasBooked = booked.length > 0;
  const firstBooked = booked[0];
  const lastBooked = booked[booked.length - 1];

  return (
    <div style={cardStyle}>
      <div style={sectionHeadStyle}>
        <h2 style={{ fontSize: 14, margin: 0, color: "var(--text-muted)" }}>改资源信息</h2>
      </div>
      {errorText && <p style={errorStyle}>{errorText}</p>}

      <form action={saveResource} style={formStyle}>
        <input type="hidden" name="id" value={s.id} />

        <label style={labelStyle}>
          类型
          <select name="item_type" defaultValue={s.item_type ?? "beta"} style={inputStyle}>
            <option value="beta">Beta</option>
            <option value="alpha">Alpha</option>
          </select>
        </label>

        <label style={labelStyle}>
          资源上的名字
          <input
            name="holder_name"
            required
            defaultValue={s.holder_name ?? ""}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          持有人性别
          {hasBooked ? (
            <>
              {/* 禁掉的控件不会提交，所以值另走一个 hidden —— 不然一保存性别就空了 */}
              <input type="hidden" name="holder_gender" value={s.holder_gender ?? ""} />
              <select
                disabled
                defaultValue={s.holder_gender ?? ""}
                style={{ ...inputStyle, color: "var(--text-faint)" }}
              >
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </>
          ) : (
            <select
              name="holder_gender"
              required
              defaultValue={s.holder_gender ?? ""}
              style={inputStyle}
            >
              <option value="" disabled>
                选一个
              </option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          )}
        </label>
        {hasBooked && (
          <p style={hintStyle}>
            这个资源已经排出去了，性别不能改 —— 客户是按性别配的，物品登记了使用人，
            核验时得对得上人。要改先联系我们。
          </p>
        )}

        <label style={labelStyle}>
          持有人生日
          <input
            name="holder_date_of_birth"
            type="date"
            defaultValue={s.holder_date_of_birth ?? ""}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          有效期开始
          <input
            name="date_range_start"
            type="date"
            max={hasBooked ? firstBooked : undefined}
            defaultValue={s.date_range_start ?? ""}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          有效期结束
          <input
            name="date_range_end"
            type="date"
            min={hasBooked ? lastBooked : undefined}
            defaultValue={s.date_range_end ?? ""}
            style={inputStyle}
          />
        </label>
        <p style={hintStyle}>
          两头都选填，留空就是这一头不设限 —— 整季通用的资源两个都空着。
        </p>
        {hasBooked && (
          <p style={hintStyle}>
            已经排出去 {formatDayRanges(booked)}，填了的那一头得把这几天盖住。
          </p>
        )}

        <label style={labelStyle}>
          状态
          <select name="status" defaultValue={s.status} style={inputStyle}>
            {RESOURCE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {RESOURCE_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <p style={hintStyle}>
          暂停和下架只管「接不接新单」，已经排出去的那几天照常生效。
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={buttonStyle}>
            保存
          </button>
          <Link href="/provider" style={cancelStyle}>
            取消
          </Link>
        </div>
      </form>
    </div>
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

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "10px 12px",
  marginTop: 14,
};
const sectionHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
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
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-faint)",
  margin: 0,
  lineHeight: 1.6,
};
const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--danger)",
  margin: "0 0 8px",
  lineHeight: 1.6,
};
const editLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--link)",
  textDecoration: "none",
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
const primaryLinkStyle: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  padding: "10px 12px",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  fontSize: 14,
  textAlign: "center",
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
