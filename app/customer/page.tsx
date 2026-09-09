import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/accountClaim";
import { formatDayRanges } from "@/lib/dates";
import { formatParty } from "@/lib/party";
import { calcAge } from "@/lib/age";
import { STATUS_LABELS, statusColor } from "@/lib/orderStatus";

export const dynamic = "force-dynamic";

// 个人资料保存。全部选填 —— 这些是「留个方便联系的方式」，不是注册门槛，
// 一个都不填也能建单。
async function saveProfile(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = await claimCustomer(user.id, user.email ?? null);

  const text = (k: string) => ((formData.get(k) as string) ?? "").trim() || null;

  const { error } = await supabase
    .from("customers")
    .update({
      first_name: text("first_name"),
      phone_number: text("phone_number"),
      chat: text("chat"),
      // 只存生日，年龄用 calcAge 现算 —— 存死数字明年就错了
      date_of_birth: text("date_of_birth"),
    })
    .eq("id", customerId);
  if (error) redirect("/customer?edit=profile&error=save");

  revalidatePath("/customer");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
  // 从建单页过来的就送回去，别让人填完还得自己找路回来
  if (formData.get("next") === "request") redirect("/customer/request");
  redirect("/customer?saved=1");
}

// 客户登录后的首页：上面是个人资料，下面是我的订单。
//
// 刻意不显示的东西：别人的订单、配到哪个资源、持有人是谁。物品是登记了使用人的，
// 持有人姓名/性别/生日属于物主的隐私，客户这边一个字都不该出现 —— 所以这里
// 根本不去查 resources 和 order_assignments，不是查了再藏。
export default async function CustomerHomePage({
  searchParams,
}: {
  searchParams: {
    created?: string;
    saved?: string;
    edit?: string;
    error?: string;
    next?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // 兜底：/auth/callback 里认领失败过的话，这里再补一次
  const customerId = await claimCustomer(user.id, user.email ?? null);

  const [{ data: me }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name, phone_number, chat, date_of_birth")
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, location, amount, status, demand_days, male_count, female_count, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);

  // 编辑态用 URL 参数切换，不用 useState —— 跟 admin 那几个列表页一个路子
  const editing = searchParams.edit === "profile";
  const age = calcAge(me?.date_of_birth);
  const noContact = !me?.phone_number && !me?.chat;

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
        <h1 style={{ fontSize: 20, margin: 0 }}>{me?.first_name || "我的账号"}</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" style={signOutStyle}>
            退出
          </button>
        </form>
      </div>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: editing ? 10 : 6,
          }}
        >
          <h2 style={{ fontSize: 14, margin: 0, color: "#444" }}>个人资料</h2>
          {!editing && (
            <Link href="/customer?edit=profile" style={{ fontSize: 13, color: "#1c4e78" }}>
              编辑
            </Link>
          )}
        </div>

        {searchParams.saved && !editing && (
          <p style={{ color: "#1f5c33", fontSize: 13, margin: "0 0 8px" }}>已保存</p>
        )}
        {searchParams.error && (
          <p style={{ color: "#c0392b", fontSize: 13, margin: "0 0 8px" }}>
            没存上，再试一次
          </p>
        )}

        {editing ? (
          <form action={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {searchParams.next && (
              <input type="hidden" name="next" value={searchParams.next} />
            )}
            <label style={labelStyle}>
              用户名（怎么称呼你）
              <input name="first_name" defaultValue={me?.first_name ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              账号
              <input name="chat" defaultValue={me?.chat ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              手机号
              <input
                name="phone_number"
                type="tel"
                defaultValue={me?.phone_number ?? ""}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              生日
              <input
                name="date_of_birth"
                type="date"
                defaultValue={me?.date_of_birth ?? ""}
                style={inputStyle}
              />
            </label>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
              全部选填。生日只是方便分配时对得上年龄 —— 物品是登记了使用人的。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/customer" style={cancelStyle}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <dl style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.9 }}>
            <Row label="登录邮箱" value={user.email ?? "-"} />
            <Row label="账号" value={me?.chat} />
            <Row label="手机号" value={me?.phone_number} />
            <Row
              label="生日"
              value={me?.date_of_birth ? `${me.date_of_birth}${age !== null ? `（${age}岁）` : ""}` : null}
            />
            {noContact && (
              <p style={{ fontSize: 12, color: "#a8620d", margin: "6px 0 0" }}>
                留个手机号或者聊天吧 —— 配到资源之后我们要能找到你。
              </p>
            )}
          </dl>
        )}
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 22,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>我的订单</h2>
      </div>

      {searchParams.created && (
        <p style={{ color: "#1f5c33", fontSize: 13, margin: "8px 0 0" }}>
          需求提交成功，管理员会帮你匹配物主。
          {noContact && (
            <>
              {" "}
              <Link href="/customer?edit=profile" style={{ color: "#8a4b00" }}>
                但你还没留聊天或手机号，配到资源我们不好通知你 —— 现在补一下 →
              </Link>
            </>
          )}
        </p>
      )}

      <Link href="/customer/request" style={newOrderStyle}>
        + 发一个新的租借需求
      </Link>

      {!orders || orders.length === 0 ? (
        <p style={{ marginTop: 20, color: "#666", fontSize: 14 }}>
          你还没有订单，点上面那个按钮发一个。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {orders.map((o: any) => {
            const c = statusColor(o.status);
            return (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.bg,
                  color: c.text,
                  borderRadius: 6,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {formatDayRanges(o.demand_days ?? [])}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                  {o.location ? `${o.location} · ` : ""}
                  {formatParty(o.male_count, o.female_count)}
                  {o.demand_days?.length ? ` · ${o.demand_days.length}天` : ""}
                  {o.amount != null ? ` · $${o.amount}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ color: "#888", width: 72, flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value || <span style={{ color: "#bbb" }}>未填</span>}</dd>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e2e2",
  borderRadius: 6,
  padding: "12px 14px",
  marginTop: 14,
};
const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#444",
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
const cancelStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
  color: "#444",
  textDecoration: "none",
};
const newOrderStyle: React.CSSProperties = {
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
