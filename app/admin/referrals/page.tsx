import type { CSSProperties } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS } from "@/lib/person";
import { getReferralBandDays, getReferralRate, setReferralRate } from "@/lib/appSettings";
import Link from "next/link";
import { formatDayRanges, todayIso } from "@/lib/dates";
import { weekBounds } from "@/lib/revenue";
import CalendarView from "./CalendarView";
import PersonInput from "./PersonInput";
import ReferralUI from "./ReferralUI";
import ReferralCalendar from "./ReferralCalendar";
import { buildReferralCalendar } from "@/lib/referralBoard";
import { STATUS_LABELS, statusColor } from "@/lib/orderStatus";
import { PAY_METHODS, parsePayMethod } from "@/lib/payMethods";
import {
  boardTotals,
  buildReferralBoard,
  effectiveRate,
  formatRate,
  isPayoutOnDeadOrder,
  outstandingOf,
  parseRatePercent,
  formatReferralWindow,
  parseReferralWindow,
  referralBlockReason,
  customerHandle,
  SKIP_LABELS,
  customerName,
  resolveCustomer,
  type RebateRow,
  type ReferralCustomer,
} from "@/lib/referral";
import {
  buttonStyle,
  cellStyle,
  headerRowStyle,
  helpTextStyle,
  inputStyle,
  linkButtonStyle,
  dangerLinkStyle,
  pageTitleStyle,
  rowStyle,
  segActiveStyle,
  segStyle,
  selectStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

const PAGE = "/admin/referrals";

// 列宽只许有一份：表头和数据行都从这儿取。写死两遍就会错开 ——
// CLAUDE.md 里那条「第二份数字和第二份样式是同一个 bug」
const COL = {
  referee: 12,
  order: 22,
  status: 9,
  amount: 9,
  rate: 7,
  rebate: 9,
  paid: 9,
  action: 23,
} as const;

const col = (n: number): CSSProperties => ({ ...cellStyle, flex: `${n} 1 0` });

// 关系列表的列宽。跟上面那张台账各一份 —— 两张表的列不一样，
// 共用一个常量反而是把不相干的东西绑在一起
const LINK_COL = {
  referee: 18,
  referrer: 18,
  rate: 12,
  window: 26,
  orders: 12,
  action: 14,
} as const;

/** 输入框里填的是百分数。0.1 → "10"。formatRate 带 %，输入框里不能带 */
const ratePercent = (rate: number) => `${Math.round(rate * 10000) / 100}`;


function fail(reason: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(reason)}`);
}

/**
 * 登记完回哪儿。**只认本页的相对路径** —— 表单里的值是客户端来的，
 * 直接拿去 redirect 就是个开放重定向（谁都能构造一个跳去外站的表单）。
 */
function backOf(formData: FormData): string {
  const raw = (formData.get("back") as string) ?? "";
  return raw.startsWith(PAGE) ? raw : PAGE;
}

/** 关系变了，Customer 那页也显示介绍人，一起刷 */
function revalidateReferral() {
  revalidatePath(PAGE);
  revalidatePath("/admin/customers");
}

/**
 * 客户名单。**查询出错必须往外报，不能当成「一个人都没有」** ——
 * 栽过一次：迁移还没跑的时候 select 里带着不存在的列，PostgREST 整条失败返回
 * 空数组，于是查找拿到空名单，报出来的是「找不到 kukucai 这个人」。
 * 人明明在库里，错误信息却指着人名，排查方向整个错了。
 */
async function loadCustomersById(): Promise<{
  byId: Map<string, ReferralCustomer>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      `id, referred_by, referral_rate, referral_from, referral_until, ${personSpread(DISPLAY_COLUMNS)}`
    );
  return {
    byId: new Map((data ?? []).map((r) => [r.id, r as ReferralCustomer])),
    error: error?.message ?? null,
  };
}

// —— 建立介绍关系 ——
// 校验走 lib/referral.ts 的 referralBlockReason()，**唯一出处**。
// 界面上藏不藏选项是另一回事，写库前一律调它 —— 不然直接 POST 就绕过去了。
async function linkReferral(formData: FormData) {
  "use server";
  const parsed = parseRatePercent(formData.get("rate"));
  if (!parsed.ok) fail(parsed.reason);
  const win = parseReferralWindow(formData.get("from"), formData.get("until"));
  if (!win.ok) fail(win.reason);

  const { byId, error: loadError } = await loadCustomersById();
  if (loadError) fail(`读不到客户名单：${loadError}`);
  const all = [...byId.values()];

  // 界面上填的是昵称，翻成 id。对不上、或者对上多个，都在这儿就停住 ——
  // 猜错一个人，返点会长期发给错的人而且台账上看着是对的
  const referee = resolveCustomer(formData.get("referee_chat"), all);
  if (!referee.ok) fail(`被介绍人：${referee.reason}`);
  const referrer = resolveCustomer(formData.get("referrer_chat"), all);
  if (!referrer.ok) fail(`介绍人：${referrer.reason}`);

  const refereeId = referee.id;
  const referrerId = referrer.id;
  const blocked = referralBlockReason({ refereeId, referrerId, byId });
  if (blocked) fail(blocked);

  const { error } = await supabase
    .from("customers")
    .update({
      referred_by: referrerId,
      referral_rate: parsed.rate,
      referral_from: win.from,
      referral_until: win.until,
    })
    .eq("id", refereeId);
  if (error) fail(error.message);

  revalidateReferral();
  redirect(PAGE);
}

async function unlinkReferral(formData: FormData) {
  "use server";
  const refereeId = (formData.get("referee_id") as string) ?? "";
  if (!refereeId) fail("没选人");
  // 比例快照跟着关系一起清掉：留着的话下次给他配别的介绍人，
  // 会静悄悄沿用上一段关系谈好的比例
  const { error } = await supabase
    .from("customers")
    .update({ referred_by: null, referral_rate: null, referral_from: null, referral_until: null })
    .eq("id", refereeId);
  if (error) fail(error.message);
  revalidateReferral();
  redirect(PAGE);
}

/**
 * 改这条关系的条款（比例 + 返点窗口），不动关系本身。
 * 改完是**往前往后都按新条款算** —— 返点是现算的，不是存下来的。
 * 已经付过的那几笔不受影响（那是事实，在 referral_payouts 里）。
 */
async function updateTerms(formData: FormData) {
  "use server";
  const refereeId = (formData.get("referee_id") as string) ?? "";
  if (!refereeId) fail("没选人");
  const parsed = parseRatePercent(formData.get("rate"));
  if (!parsed.ok) fail(parsed.reason);
  const win = parseReferralWindow(formData.get("from"), formData.get("until"));
  if (!win.ok) fail(win.reason);
  const { error } = await supabase
    .from("customers")
    .update({ referral_rate: parsed.rate, referral_from: win.from, referral_until: win.until })
    .eq("id", refereeId);
  if (error) fail(error.message);
  revalidateReferral();
  redirect(PAGE);
}

// —— 登记「返点真付出去了」——
// 这是这一页唯一往库里写金额的地方。「该返多少」不写，它按订单金额现算。
async function payRebate(formData: FormData) {
  "use server";
  const referrerId = (formData.get("referrer_id") as string) ?? "";
  const orderId = (formData.get("order_id") as string) ?? "";
  const amount = Number(formData.get("amount"));
  if (!referrerId || !orderId) fail("缺少订单或介绍人");
  if (!Number.isFinite(amount) || amount <= 0) fail("返点金额要是个大于 0 的数");

  const { error } = await supabase.from("referral_payouts").insert({
    referrer_id: referrerId,
    order_id: orderId,
    amount,
    // 方式不填就是 null（parsePayMethod 认不出来的一律当没填），
    // 别硬塞个空串进去让库的 check 报错
    method: parsePayMethod(formData.get("method")),
  });
  // 库里 unique(order_id, referrer_id) 兜着重复登记 —— 两个人同时点、
  // 或者刷新重提交都会撞上这条，把它翻成人话而不是甩个 Next 错误页
  if (error) fail(`登记失败：${error.message}`);

  revalidatePath(PAGE);
  // 从日历点进来的就回日历，别把人甩回台账
  redirect(backOf(formData));
}

async function unpayRebate(formData: FormData) {
  "use server";
  const referrerId = (formData.get("referrer_id") as string) ?? "";
  const orderId = (formData.get("order_id") as string) ?? "";
  const { error } = await supabase
    .from("referral_payouts")
    .delete()
    .eq("order_id", orderId)
    .eq("referrer_id", referrerId);
  if (error) fail(error.message);
  revalidatePath(PAGE);
  redirect(backOf(formData));
}

function money(n: number | null): string {
  return n === null ? "-" : `$${n.toLocaleString()}`;
}

function StatusChip({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
      }}
    >
      {STATUS_LABELS[status] ?? (status || "-")}
    </span>
  );
}

function LedgerRow({ row, back }: { row: RebateRow; back: string }) {
  const due = outstandingOf(row);
  const dead = isPayoutOnDeadOrder(row);
  return (
    <div style={rowStyle}>
      {/* 昵称为主，有账号的在旁边小字带上 */}
      <div style={col(COL.referee)}>
        {row.refereeName}
        {row.refereeChatId && row.refereeName !== row.refereeChatId && (
          <span style={{ color: "var(--text-faint)" }}> {row.refereeChatId}</span>
        )}
      </div>
      <div style={col(COL.order)}>
        <span>{row.location || "-"}</span>
        <span style={{ color: "var(--text-faint)" }}>
          {" · "}
          {row.days.length > 0 ? formatDayRanges(row.days) : "没填日期"}
        </span>
      </div>
      <div style={col(COL.status)}>
        <StatusChip status={row.orderStatus} />
      </div>
      <div style={col(COL.amount)}>{money(row.orderAmount)}</div>
      <div style={col(COL.rate)}>{formatRate(row.rate)}</div>
      <div style={{ ...col(COL.rebate), fontWeight: due > 0 ? 500 : 400 }}>
        {row.counts ? (
          money(row.rebate)
        ) : (
          // 「单子黄了」和「不在返点窗口里」要分得开，都写「不计」等于没说
          <span style={{ color: "var(--text-faint)" }}>
            {SKIP_LABELS[row.skipReason ?? "status"]}
          </span>
        )}
      </div>
      <div style={col(COL.paid)}>
        {row.hasPayout ? (
          <span style={{ color: dead ? "var(--warn)" : "var(--ok)" }}>{money(row.paid)}</span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>-</span>
        )}
      </div>
      <div style={col(COL.action)}>
        {row.hasPayout ? (
          <form action={unpayRebate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="hidden" name="order_id" value={row.orderId} />
            <input type="hidden" name="referrer_id" value={row.referrerId} />
            <input type="hidden" name="back" value={back} />
            {/* 付过返点、单子后来又黄了。钱已经出去了，这行不能悄悄消失 */}
            {dead && <span style={{ color: "var(--warn)", fontSize: 12 }}>单子黄了但已付</span>}
            <button type="submit" style={{ ...dangerLinkStyle, whiteSpace: "nowrap" }}>
              撤销登记
            </button>
          </form>
        ) : due > 0 ? (
          <form action={payRebate} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="hidden" name="order_id" value={row.orderId} />
            <input type="hidden" name="referrer_id" value={row.referrerId} />
            <input type="hidden" name="back" value={back} />
            <input
              name="amount"
              type="number"
              step="0.01"
              defaultValue={due}
              style={{ ...inputStyle, padding: "2px 4px", fontSize: 12, width: 64 }}
            />
            <select
              name="method"
              defaultValue=""
              style={{ ...selectStyle, padding: "2px 4px", fontSize: 12 }}
            >
              <option value="">方式</option>
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {/* nowrap：操作那一格窄，不加会断成「登记已 / 付」两行，整行跟着变高 */}
            <button
              type="submit"
              style={{ ...linkButtonStyle, color: "var(--link)", whiteSpace: "nowrap" }}
            >
              登记已付
            </button>
          </form>
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>-</span>
        )}
      </div>
    </div>
  );
}


/**
 * 日历上点开一个块之后，底下这张登记面板。
 *
 * 为什么不做成浮层：这一页全是 Server Component，状态走 URL 参数 ——
 * 铺在日历底下的话，点谁、登记到哪一步都在地址栏里，刷新/收藏/分享都还在。
 */
function PayPanel({
  row,
  referrer,
  back,
}: {
  row: RebateRow;
  referrer: string;
  back: string;
}) {
  const due = outstandingOf(row);
  const dead = isPayoutOnDeadOrder(row);
  return (
    <div
      // 「点别处收起来」认的是**这个资源**，不是外面那个格子 ——
      // 格子跨 9 列 2 行是一大片空白，认它的话在日历里点空白处收不起来
      data-ref-card=""
      style={{
        // **贴着内容宽**，不撑满格子 —— 格子是拿来定位的（12 列），
        // 面板本身只占它需要的那点宽度，右边不留一大片空白
        width: "fit-content",
        maxWidth: "100%",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: "8px 10px",
        marginTop: 5,
        background: "var(--surface)",
        // 一点浮起来的感觉：它是挂在块下面的一个资源，不是日历的一行
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {/* 第一行：这笔返点是怎么来的。人名重一点，来龙去脉淡一点 */}
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "nowrap",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        <strong style={{ color: "var(--text)" }}>{row.refereeName}</strong>
        {" · "}
        {row.location || "没填地点"} {formatDayRanges(row.days)} {money(row.orderAmount)}
        <span style={{ margin: "0 5px", color: "var(--text-faint)" }}>→</span>
        <strong style={{ color: "var(--text)" }}>{referrer}</strong>
        {row.counts ? (
          <>
            {" "}
            {formatRate(row.rate)}{" "}
            <strong style={{ color: "var(--text)" }}>{money(row.rebate)}</strong>
          </>
        ) : (
          <> 不返（{SKIP_LABELS[row.skipReason ?? "status"]}）</>
        )}
      </div>

      {row.hasPayout ? (
        <form action={unpayRebate} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="hidden" name="order_id" value={row.orderId} />
          <input type="hidden" name="referrer_id" value={row.referrerId} />
          <input type="hidden" name="back" value={back} />
          <span style={{ fontSize: 13, color: dead ? "var(--warn)" : "var(--ok)" }}>
            已付 {money(row.paid)}
            {dead && "（单子后来黄了）"}
          </span>
          <button type="submit" style={{ ...dangerLinkStyle, whiteSpace: "nowrap" }}>
            撤销登记
          </button>
        </form>
      ) : due > 0 ? (
        <form
          action={payRebate}
          style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}
        >
          <input type="hidden" name="order_id" value={row.orderId} />
          <input type="hidden" name="referrer_id" value={row.referrerId} />
          <input type="hidden" name="back" value={back} />
          <input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={due}
            aria-label="已付金额"
            style={{ ...inputStyle, padding: "4px 6px", fontSize: 13, width: 72 }}
          />
          {/* 方式选填。逼着选一个只会让人随手挑第一个，账上留下一堆假的 zelle */}
          <select
            name="method"
            defaultValue=""
            aria-label="付款方式"
            style={{ ...selectStyle, padding: "4px 6px", fontSize: 13 }}
          >
            <option value="">方式</option>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={{ ...buttonStyle, padding: "4px 12px", fontSize: 13, whiteSpace: "nowrap" }}
          >
            登记已付
          </button>
        </form>
      ) : (
        <p style={{ ...helpTextStyle, margin: 0 }}>这一笔没有要付的返点。</p>
      )}
    </div>
  );
}

export default async function ReferralsAdminPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  // 一季 150~250 单、几百个人，全量拉回来几十 KB。返点整个是算出来的，
  // 建单那一刻不写任何东西，所以这里是唯一一次「算返点」的地方。
  const [{ data: customers, error }, { data: orders }, { data: payouts }, defaultRate] =
    await Promise.all([
      supabase
        .from("customers")
        .select(
          `id, referred_by, referral_rate, referral_from, referral_until, ${personSpread(DISPLAY_COLUMNS)}`
        )
        .order("created_at", { ascending: false }),
      supabase.from("orders").select("id, customer_id, demand_days, location, amount, status"),
      supabase.from("referral_payouts").select("order_id, referrer_id, amount"),
      getReferralRate(),
    ]);
  const bandDays = await getReferralBandDays();

  const all = (customers ?? []) as ReferralCustomer[];
  const byId = new Map(all.map((r) => [r.id, r]));
  const groups = buildReferralBoard({
    customers: all,
    orders: orders ?? [],
    payouts: payouts ?? [],
    defaultRate,
  });
  // 「本周待付」= 到本周日为止该付的。返点是单子用完了才该给，
  // 收口点跟 lib/revenue.ts 那三个流水数字同一个
  const totals = boardTotals(groups, weekBounds(todayIso()).end);

  // 候选表按昵称排 —— 上面那两个框就是拿昵称填的
  const picker = [...all].sort((a, b) => customerHandle(a).localeCompare(customerHandle(b)));

  // 两个视图：日历（默认 —— 返点是跟着日子走的，先看它落在哪儿）和台账
  // （按介绍人分组，一个人欠多少一目了然）。两边都能登记付款。
  const view = searchParams.view === "ledger" ? "ledger" : "calendar";
  // 哪一行在编辑态。**走 URL 参数不用 useState** —— CLAUDE.md 里列表页的约定，
  // 保存后 redirect 回列表就退出编辑态。改关系是十天半月一次的事，
  // 回一趟服务端没关系（切视图/点块那种高频动作才值得搬到客户端）
  const editId = searchParams.edit ?? "";
  // 日历上点开的是哪一笔（`订单::介绍人`）
  const payKey = searchParams.pay ?? "";
  // 「今天是哪天」在服务端算好传下去，客户端自己算会在跨日那几小时对不上
  const today = todayIso();
  const calendar = buildReferralCalendar({
    today,
    // 日历上一个块 = 一笔返点，所以要的是拍平的行，外加「这笔返给谁」
    rows: groups.flatMap((g) =>
      g.rows.map((r) => ({ ...r, referrerName: g.referrerName }))
    ),
  });

  // 每一笔返点按 key 索引，日历那边每个块都要拿它渲染自己的登记面板
  const rowByKey = new Map<string, { row: RebateRow; referrer: string }>();
  for (const g of groups) {
    for (const r of g.rows) {
      rowByKey.set(`${r.orderId}::${r.referrerId}`, {
        row: r,
        referrer: g.referrerName,
      });
    }
  }

  // 所有介绍关系，拍平成一张表。**不另发查询** —— customers 和 orders 都在手上了
  const orderCount = new Map<string, number>();
  for (const o of orders ?? []) orderCount.set(o.customer_id, (orderCount.get(o.customer_id) ?? 0) + 1);
  const links = all
    .filter((r) => r.referred_by && byId.has(r.referred_by))
    .map((r) => ({
      referee: r,
      referrer: byId.get(r.referred_by!)!,
      orders: orderCount.get(r.id) ?? 0,
    }))
    .sort((a, b) =>
      customerHandle(a.referrer).localeCompare(customerHandle(b.referrer)) ||
      customerHandle(a.referee).localeCompare(customerHandle(b.referee))
    );

  return (
    <main>
      <h1 style={pageTitleStyle}>Referral</h1>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error.message}</p>}
      {searchParams.error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>没改成：{searchParams.error}</p>
      )}

      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "baseline",
          margin: "12px 0",
          fontSize: 13,
        }}
      >
        <span>
          介绍人 <strong>{totals.referrers}</strong> 人
        </span>
        <span>
          被介绍 <strong>{totals.referees}</strong> 人
        </span>
        {/* 这个才是「现在该打多少钱出去」—— 往后那些单子还没用，不该算进来 */}
        <span style={{ color: totals.dueNow > 0 ? "var(--danger)" : "var(--text-muted)" }}>
          <b>本周待付 {money(totals.dueNow)}</b>
        </span>
        {/* 合计里含往后还没用的那些。注意它**不等于**「应返 − 已付」：
            每行待付有 Math.max(0, …) 兜底，某单付超了（后来金额改小了）
            不往回冲成负数 —— 所以这是个独立的数，不是减法能替代的 */}
        <span style={{ color: "var(--text-faint)" }}>
          待付合计 {money(totals.outstanding)}
        </span>
        <span style={{ color: "var(--ok)" }}>已付合计 {money(totals.totalPaid)}</span>
      </div>

      {/* 建立关系是这一页的入口动作，**不折叠**。
          原来收在一个 <details> 里，页面上只剩一行小灰字，等于没有这个入口。 */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "10px 12px",
          margin: "12px 0 4px",
          background: "var(--surface-2)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>建立介绍关系</div>

        {/* 拿**昵称**指人，不是下拉选 id：一季几百个客户，下拉里翻名字比
            直接打昵称慢得多，而且平时在群里、在 Sheet 上认人本来就是认昵称。
            候选**打了字才给**（PersonInput），一聚焦倒出全部几百人那是干扰不是补全。
            而且候选只是补全，真正解析在服务端的 resolveCustomer()，对不上/对上多个
            都拦住 —— 光靠界面的话直接 POST 就绕过去了。 */}
        <form
          action={linkReferral}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
        >
          <PersonInput
            name="referee_chat"
            placeholder="被介绍人昵称，如 terence"
            people={picker}
          />
          <span style={helpTextStyle}>是被</span>
          <PersonInput
            name="referrer_chat"
            placeholder="介绍人昵称，如 denton"
            people={picker}
          />
          <span style={helpTextStyle}>介绍来的，返点</span>
          <input
            name="rate"
            placeholder={ratePercent(defaultRate)}
            title="留空 = 跟随全局默认"
            style={{ ...inputStyle, width: 56 }}
          />
          <span style={helpTextStyle}>%，生效期</span>
          {/* 返点窗口：两头各自可空，空 = 这一头不设限（跟资源有效期同一套约定）。
              资源的是**活动日**，不是下单日 */}
          <input name="from" type="date" title="返点窗口起点，留空 = 不设限" style={inputStyle} />
          <span style={helpTextStyle}>~</span>
          <input name="until" type="date" title="返点窗口终点，留空 = 不设限" style={inputStyle} />
          <button type="submit" style={buttonStyle}>
            建立关系
          </button>
        </form>

        {/* 平时收着，要查的时候点开。**标题上带数字** —— 不带的话折叠就只是
            把东西藏起来，看不见就等于没有（CLAUDE.md 里那条） */}
        {/* 正在改哪一行就默认展开 —— 不然点了「改」跳回来，折叠块合上了，
            编辑态藏在里面看不见 */}
        <details open={!!editId} style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
            所有介绍关系：{links.length} 条
          </summary>

          {links.length === 0 ? (
            <p style={{ ...helpTextStyle, marginTop: 8 }}>还没建过关系。</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...headerRowStyle, padding: "4px 0" }}>
                <div style={col(LINK_COL.referee)}>被介绍人</div>
                <div style={col(LINK_COL.referrer)}>介绍人</div>
                <div style={col(LINK_COL.rate)}>比例</div>
                <div style={col(LINK_COL.window)}>生效期</div>
                <div style={col(LINK_COL.orders)}>下过单</div>
                <div style={col(LINK_COL.action)} />
              </div>
              {links.map(({ referee, referrer, orders: n }) =>
                editId === referee.id ? (
                  // 编辑态。**只有比例和生效期能改** —— 换介绍人不在这儿，
                  // 那等于把这个人所有历史单子的返点一起挪走，得先解除
                  <form
                    key={referee.id}
                    action={updateTerms}
                    style={{ ...rowStyle, padding: "4px 0" }}
                  >
                    <input type="hidden" name="referee_id" value={referee.id} />
                    <div style={col(LINK_COL.referee)}>{customerHandle(referee)}</div>
                    <div style={col(LINK_COL.referrer)}>{customerHandle(referrer)}</div>
                    <div style={col(LINK_COL.rate)}>
                      <input
                        name="rate"
                        defaultValue={
                          referee.referral_rate == null
                            ? ""
                            : ratePercent(effectiveRate(referee, defaultRate))
                        }
                        placeholder={ratePercent(defaultRate)}
                        title="留空 = 跟随全局默认"
                        style={{ ...inputStyle, width: 52, padding: "2px 4px", fontSize: 12 }}
                      />
                      <span style={{ color: "var(--text-faint)" }}> %</span>
                    </div>
                    <div style={{ ...col(LINK_COL.window), display: "flex", gap: 4 }}>
                      <input
                        name="from"
                        type="date"
                        defaultValue={referee.referral_from ?? ""}
                        title="留空 = 不设限"
                        style={{ ...inputStyle, padding: "2px 4px", fontSize: 12 }}
                      />
                      <input
                        name="until"
                        type="date"
                        defaultValue={referee.referral_until ?? ""}
                        title="留空 = 不设限"
                        style={{ ...inputStyle, padding: "2px 4px", fontSize: 12 }}
                      />
                    </div>
                    <div style={col(LINK_COL.orders)}>{n} 单</div>
                    <div style={{ ...col(LINK_COL.action), display: "flex", gap: 8 }}>
                      <button type="submit" style={{ ...buttonStyle, padding: "2px 10px", fontSize: 12 }}>
                        保存
                      </button>
                      <Link href={PAGE} style={{ ...linkButtonStyle, lineHeight: "22px" }}>
                        取消
                      </Link>
                    </div>
                  </form>
                ) : (
                  <div key={referee.id} style={{ ...rowStyle, padding: "4px 0" }}>
                    <div style={col(LINK_COL.referee)}>{customerHandle(referee)}</div>
                    <div style={col(LINK_COL.referrer)}>{customerHandle(referrer)}</div>
                    <div style={col(LINK_COL.rate)}>
                      {formatRate(effectiveRate(referee, defaultRate))}
                      {referee.referral_rate == null && (
                        <span style={{ color: "var(--text-faint)" }}> 默认</span>
                      )}
                    </div>
                    <div style={col(LINK_COL.window)}>{formatReferralWindow(referee)}</div>
                    <div style={col(LINK_COL.orders)}>{n} 单</div>
                    <div style={{ ...col(LINK_COL.action), display: "flex", gap: 10 }}>
                      <Link href={`${PAGE}?edit=${referee.id}`} style={linkButtonStyle}>
                        修改
                      </Link>
                      <form action={unlinkReferral}>
                        <input type="hidden" name="referee_id" value={referee.id} />
                        <button type="submit" style={dangerLinkStyle}>
                          解除
                        </button>
                      </form>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </details>

      </div>

      {/* 视图切换。样式跟匹配台那三个段控件一致 —— 同一个后台不该有两套开关长相。
          **默认那个摆左边**：段控件里左边那格默认就读作「常态」 */}
      <div style={{ display: "flex", gap: 0, margin: "14px 0 10px" }}>
        {/* href 留着：JS 没跑起来（或者还没 hydrate）时照样切得动。
            跑起来之后 ReferralUI 拦掉点击，改成纯 CSS 切换，不回服务端 */}
        <Link
          href={PAGE}
          data-view-btn="calendar"
          style={view === "calendar" ? segActiveStyle : segStyle}
        >
          日历
        </Link>
        <Link
          href={`${PAGE}?view=ledger`}
          data-view-btn="ledger"
          style={view === "ledger" ? segActiveStyle : segStyle}
        >
          台账
        </Link>
      </div>

      {/* **两个视图都渲染出来**，显哪个由 ReferralUI 注入的一条 CSS 规则决定。
          切换因此是零网络的 —— 原来走 URL 参数，每切一下回服务端整页重渲染，
          要查客户 + 订单 + 返点付款三张表，一次一两秒。
          代价是首屏多画一份 DOM：一季的返点笔数是订单的一小撮，认了。 */}
      <div data-ref-view="calendar">
        <CalendarView
          board={calendar}
          today={today}
          initialBandDays={bandDays}
          // 每一块的登记面板都先渲染好（表单挂着 Server Action），
          // 传的是**节点**不是回调 —— 函数跨不过客户端边界
          panels={Object.fromEntries(
            [...rowByKey.entries()].map(([key, hit]) => [
              key,
              <PayPanel
                key={key}
                row={hit.row}
                referrer={hit.referrer}
                back={`${PAGE}?pay=${encodeURIComponent(key)}`}
              />,
            ])
          )}
        />
      </div>

      <div data-ref-view="ledger">

      {groups.length === 0 && (
        <p style={{ ...helpTextStyle, marginTop: 20 }}>
          还没有任何介绍关系。用上面那个框建第一条，比如「terence 是被 denton 介绍来的」。
        </p>
      )}

      {groups.map((g) => (
        // 默认摊开还欠钱的那几组 —— 这一页最常回答的问题是「现在该给谁打钱」
        <details key={g.referrerId} open={g.outstanding > 0} style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", padding: "4px 0" }}>
            <strong style={{ fontSize: 15 }}>{g.referrerName}</strong>
            {g.referrerChatId && g.referrerName !== g.referrerChatId && (
              <span style={{ color: "var(--text-faint)", fontSize: 13 }}> {g.referrerChatId}</span>
            )}
            {/* 折叠块的标题上必须带能回答问题的数字，否则折叠只是把东西藏起来 */}
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {" · "}介绍了 {g.refereeCount} 人 · {g.rows.length} 单 · 应返{" "}
              {money(g.totalRebate)} · 已付 {money(g.totalPaid)}
            </span>
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                color: g.outstanding > 0 ? "var(--danger)" : "var(--text-faint)",
              }}
            >
              待付 {money(g.outstanding)}
            </span>
          </summary>

          {/* 介绍了谁 + 各自的条款。**只读** —— 改在上面「所有介绍关系」那张表里，
              那是关系管理的唯一入口。这儿再放一份编辑表单就是第二份同样的东西 */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 14px",
              alignItems: "center",
              padding: "6px 0",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            {[...byId.values()]
              .filter((r) => r.referred_by === g.referrerId)
              .sort((a, b) => customerHandle(a).localeCompare(customerHandle(b)))
              .map((r) => (
                <span key={r.id}>
                  <span style={{ color: "var(--text)" }}>{customerHandle(r)}</span>
                  {" · "}
                  {formatRate(effectiveRate(r, defaultRate))}
                  {" · "}
                  {formatReferralWindow(r)}
                </span>
              ))}
          </div>

          {g.rows.length === 0 ? (
            <p style={helpTextStyle}>介绍的人还没下过单</p>
          ) : (
            <>
              {/* <form> 塞不进 <table>，这里每行都有登记返点的表单，所以走 div 布局 */}
              <div style={headerRowStyle}>
                <div style={col(COL.referee)}>被介绍人</div>
                <div style={col(COL.order)}>订单</div>
                <div style={col(COL.status)}>状态</div>
                <div style={col(COL.amount)}>订单金额</div>
                <div style={col(COL.rate)}>比例</div>
                <div style={col(COL.rebate)}>该返</div>
                <div style={col(COL.paid)}>已付</div>
                <div style={col(COL.action)}>操作</div>
              </div>
              {g.rows.map((row) => (
                <LedgerRow
                  key={`${row.orderId}-${row.referrerId}`}
                  row={row}
                  back={`${PAGE}?view=ledger`}
                />
              ))}
            </>
          )}
        </details>
      ))}
      </div>

      {/* 切视图 / 点块开面板 / 点别处收起，三个都不要新数据 —— 客户端状态 */}
      <ReferralUI initialView={view} initialPay={payKey} />
    </main>
  );
}
