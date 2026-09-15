import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { formatDayRanges, todayIso } from "@/lib/dates";
import { formatParty } from "@/lib/party";
import { RESOURCE_EDIT_ERRORS } from "@/lib/resourceEdit";
import { matchDisplay, isOpenMatch, isStaleMatch } from "@/lib/matchStatus";
import { firstDay } from "@/lib/matchSort";
import { actionableOrders, buildProviderBoard } from "@/lib/providerBoard";
import { matchesLocationFilter } from "@/lib/locations";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { cookies } from "next/headers";

import { bookedDaysFor, readViewSettings } from "./data";
import DemandBoard, { ProposeConfirm, parseView } from "./DemandBoard";
import ResourceList from "./ResourceList";
import AccountMenu from "./AccountMenu";
import Disclosure, { summaryCss } from "./Disclosure";

export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  ...RESOURCE_EDIT_ERRORS,
  save: "没存上，再试一次。",
  chat: "账号得填 —— 我们是通过聊天联系你的。",
  hasBookings:
    "这个资源已经排出去了，删不了 —— 删掉会把分配记录一起带走，订单那边还显示配好了资源。不想再出租的话改成「暂停」或「已下架」。",
  notmine: "那个资源不是你的。",
  dup: "这一单你已经提过意向了，等管理员确认就行。",
  blocked: "这一单现在接不了了 —— 可能刚被别人接走，或者日期改了。刷新看看。",
};

// 物主的**唯一落脚点**。原来是两页（这一页管资源，/provider/matches 管看需求），
// 来回跳。现在合成一页。
//
// **一页不等于什么都摊开。** 合完之后五个区块同等重量地摞着，主要动作（找活儿、
// 提意向）被淹在里面。所以：日历是唯一铺开的东西，账号收进右上角的菜单，
// 意向和资源收成折叠块 —— 但**每个折叠块的标题上都带着能回答问题的数字**
// （「2 条在等」「1 张」）。收起来的前提是收起来之后照样看得见状态，
// 否则折叠只是把东西藏起来逼人一个个点开，比摊着还烦。
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
    deleted?: string;
    delete?: string;
    error?: string;
    card?: string;
    view?: string;
    region?: string;
    mtn?: string;
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
      // 物主把它删了就当它不存在。库里还在，admin 那边照常看得见（迁移 0013）
      .is("deleted_at", null)
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

  const viewSettings = readViewSettings();
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  const region = searchParams.region ?? "";
  const mtn = searchParams.mtn ?? "";

  // 地点 / 区域筛选只作用在**需求**上，不碰「已排」—— 那是这个资源自己的占用情况，
  // 按地点筛掉的话，日历上会凭空空出几天，看着像资源空着其实是被占着的
  const visibleOrders = (orders ?? []).filter((o: any) =>
    matchesLocationFilter(o.location, { region, mtn })
  );

  const board = buildProviderBoard({
    today: todayIso(),
    resources: boardResources,
    orders: visibleOrders,
    start: viewSettings.start,
    assignedByOrder,
    bookedByResource,
    // 已经提过的用**全部**意向算，不跟着筛选走：换个资源看的时候不该又变回「可提」
    proposed: new Set(
      (myMatches ?? [])
        .filter((m: any) => isOpenMatch(m.status) || m.status === "chosen")
        .map((m: any) => `${m.order_id}:${m.resource_id}`)
    ),
  });

  const view = parseView(searchParams.view);
  const editing = searchParams.edit;
  const errorText = searchParams.error ? ERROR_TEXT[searchParams.error] ?? "出了点问题，再试一次。" : null;

  const [pendingOrder, pendingResource] = (searchParams.propose ?? "").split(":");
  const pendingBlock = board.rows
    .find((r) => r.resourceId === pendingResource)
    ?.lanes.flat()
    .find((b) => b.orderId === pendingOrder);

  // 「在等」不算已经落空的：那一单都开始了，跟他说「等确认」就是在骗他 ——
  // 他再等也等不到了。落空与否现算不存，见 lib/matchStatus.ts
  const staleOf = (m: any) => isStaleMatch(m.status, firstDay(m), todayIso());
  const openMatches = (myMatches ?? []).filter(
    (m: any) => isOpenMatch(m.status) && !staleOf(m)
  );
  // 还没挂资源时预告用：还在找资源的单，按最早那天排。跟日历共用同一条「还接得了」的口径
  const waiting = actionableOrders(orders ?? [], todayIso()).sort((a: any, b: any) => {
    const x = (a.demand_days ?? []).slice().sort()[0] ?? "";
    const y = (b.demand_days ?? []).slice().sort()[0] ?? "";
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const editingResource = editing && editing !== "contact" ? editing : undefined;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* **必须走 dangerouslySetInnerHTML**：<style> 的文本子节点会被 React 转义，
          `>` 变 &gt;、`"` 变 &quot;，而 <style> 是 raw text 元素、浏览器不还原，
          选择器就整个废了，还会带出 hydration 不匹配。CLAUDE.md 记着这条，
          OptimisticAssign / BulkSelect 里也是这么写的 —— 我又踩了一遍 */}
      <style dangerouslySetInnerHTML={{ __html: summaryCss }} />

      <div style={headRowStyle}>
        <h1 style={{ fontSize: 20, margin: 0 }}>我的资源</h1>
        <AccountMenu
          email={user.email ?? ""}
          me={me}
          theme={theme}
          editing={editing === "contact"}
          errorText={editing === "contact" ? errorText : null}
        />
      </div>

      {searchParams.listed && <p style={okStyle}>资源挂上了，有人要租我们会联系你。</p>}
      {searchParams.proposed && <p style={okStyle}>已提交意向，等管理员确认。</p>}
      {searchParams.saved && !editing && <p style={okStyle}>已保存</p>}
      {searchParams.deleted && <p style={okStyle}>资源已删除。</p>}
      {errorText && !editing && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{errorText}</p>
      )}

      {/* 一个资源都还没挂过 —— 这时候「有哪些需求」是个空壳，他什么也做不了。
          所以整块换成一个醒目的入口：**先挂资源**是这个页面此刻唯一有意义的动作。
          （有资源但都不在出租中是另一回事，下面单独说。） */}
      {myResources.length === 0 ? (
        <>
          <div style={emptyHeroStyle}>
            <p style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>
              {waiting.length > 0 ? (
                <>
                  现在有 <span style={{ color: "var(--warn)" }}>{waiting.length}</span> 单在找资源
                </>
              ) : (
                "先挂一张资源"
              )}
            </p>
            <p style={heroSubStyle}>
              {waiting.length > 0
                ? "挂一个资源就能接。挂上之后这儿只会列出你这个资源接得了的那些 —— 有效期盖得住、那几天没占着、缺的正好是持有人的性别。"
                : "挂上之后，这儿会列出你这个资源接得了的需求。看中哪单点一下，管理员确认了就算数。"}
            </p>
            <Link href="/provider/listing" style={heroButtonStyle}>
              挂一个资源
            </Link>
          </div>

          {/* 还没挂资源的时候也让他看见有多少活儿 —— 空页面劝不动人，一屏需求才劝得动。
              **但不能让他以为这些他都能接**：现在没有资源，性别 / 有效期 / 类型一条都
              筛不了，所以这是全部在找资源的单，上面那句话把口径说清楚了。
              一样不带客户姓名和金额，跟挂了资源之后的规矩一致。 */}
          {waiting.length > 0 && (
            <ul style={listStyle}>
              {waiting.slice(0, TEASER_LIMIT).map((o: any) => (
                <li key={o.id} style={listItemStyle}>
                  <span style={{ fontSize: 13 }}>
                    {formatDayRanges(o.demand_days ?? [])}
                    <span style={{ color: "var(--text-muted)" }}>
                      {` · ${(o.demand_days ?? []).length}天`}
                      {o.location ? ` · ${o.location}` : ""}
                      {` · ${formatParty(o.male_count, o.female_count)}`}
                    </span>
                  </span>
                </li>
              ))}
              {waiting.length > TEASER_LIMIT && (
                <li style={{ ...listItemStyle, color: "var(--text-faint)", fontSize: 12 }}>
                  …还有 {waiting.length - TEASER_LIMIT} 单
                </li>
              )}
            </ul>
          )}
        </>
      ) : (
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>看看有哪些需求</h2>
        {/* 三行说明只有第一次有用，之后每次进来都占一屏。收起来，要看再点 */}
        <details>
          <summary style={{ fontSize: 12, color: "var(--text-faint)", cursor: "pointer" }}>
            怎么算「接得了」？
          </summary>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0 0", lineHeight: 1.7 }}>
            每一行是你的一个资源。蓝色是已经排出去的，虚线框是你这个资源接得了的需求 ——
            有效期盖得住、那几天没占着、缺的正好是你这个资源的性别。
            点一下提个意向，管理员确认之后才算数。
          </p>
        </details>

        {pendingBlock && (
          <ProposeConfirm
            block={pendingBlock}
            resourceName={
              (myResources.find((s: any) => s.id === pendingResource) as any)?.holder_name ?? "这个资源"
            }
            orderId={pendingOrder}
            resourceId={pendingResource}
            card={card}
            view={view}
          />
        )}

        {activeResources.length === 0 ? (
          // 挂过资源，但一张都不在出租中（暂停 / 已下架）。跟「一张都没挂」不是一回事，
          // 该说的也不一样 —— 他要做的是把状态改回来，不是再挂一张
          <p style={{ color: "var(--warn)", fontSize: 13, marginTop: 14, lineHeight: 1.8 }}>
            你的资源现在一张都不在出租中，所以接不了需求。到下面「我的资源」里把状态改成
            「出租中」就行。
          </p>
        ) : (
          <DemandBoard
            board={board}
            // **传全部在出租的资源，不是筛过的那张** —— 芯片行要靠它才画得出来。
            // 传筛过的话，一收窄到某个资源，选择器自己就没了，回不到「全部资源」。
            resources={activeResources}
            card={card}
            view={view}
            propose={searchParams.propose ?? ""}
            bandDays={viewSettings.bandDays}
            start={viewSettings.start}
            region={region}
            mtn={mtn}
          />
        )}
      </section>
      )}

      <div style={{ marginTop: 20 }}>
        <Disclosure
          title="我提过的意向"
          badge={
            openMatches.length > 0
              ? `${openMatches.length} 条在等`
              : (myMatches ?? []).length > 0
                ? `${(myMatches ?? []).length} 条`
                : "还没提过"
          }
          badgeColor={openMatches.length > 0 ? "var(--st-pickup-text)" : undefined}
          // 刚提完就展开，让人看见它确实落进去了
          open={Boolean(searchParams.proposed)}
        >
          {(myMatches ?? []).length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>
              上面看到能接的点一下就行。
            </p>
          ) : (
            <ul style={listStyle}>
              {(myMatches ?? []).map((m: any) => {
                const d = matchDisplay(m.status, staleOf(m));
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
        </Disclosure>

        <Disclosure
          title="我的资源"
          badge={myResources.length > 0 ? `${myResources.length} 张` : "一张都还没挂"}
          badgeColor={myResources.length === 0 ? "var(--warn)" : undefined}
          // 正在改某一张、或者一张都没有（那是要办的事），就别让人先点一下
          open={Boolean(editingResource) || myResources.length === 0}
        >
          <ResourceList
            resources={myResources}
            bookedDays={bookedByResource}
            editing={editingResource}
            deleting={searchParams.delete === "1"}
            openMatchCount={
              openMatches.filter((m: any) => m.resource_id === editingResource).length
            }
            errorText={editingResource ? errorText : null}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, lineHeight: 1.7 }}>
              改完马上生效。要整张删掉，或者要把有效期改到盖不住已排的日子，先联系我们。
            </p>
            <Link href="/provider/listing" style={{ fontSize: 13, color: "var(--link)", flexShrink: 0 }}>
              + 挂一个新资源
            </Link>
          </div>
        </Disclosure>
      </div>
    </main>
  );
}

/** 预告最多列几条 —— 再多就成了「所有单子列表」，而他现在一单也接不了 */
const TEASER_LIMIT = 6;

const heroSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  margin: "8px 0 0",
  lineHeight: 1.8,
  maxWidth: 440,
};
const emptyHeroStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  marginTop: 18,
  padding: "34px 24px",
  border: "1px dashed var(--border-strong)",
  borderRadius: 10,
  background: "var(--surface-2)",
};
const heroButtonStyle: React.CSSProperties = {
  marginTop: 18,
  padding: "11px 26px",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 6,
  fontSize: 14,
  textDecoration: "none",
};
const headRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
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
