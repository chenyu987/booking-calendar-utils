import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { deleteOrder as deleteOrderAndStrayPerson } from "@/lib/deleteOrder";
import { resolveAdmin, resolvePrimaryAdmin } from "@/lib/admins";
import { loadAdmins } from "@/lib/personContacts";
import AdminSwitcher from "./AdminSwitcher";
import { currentAdminId } from "@/lib/adminSession";
import { ITEM_MODE_COOKIE, parseItemMode } from "@/lib/itemMode";
import DragAssign from "./DragAssign";
import DragMove from "./DragMove";
import OptimisticAssign from "./OptimisticAssign";
import BulkSelect from "./BulkSelect";
import CardsRowScroll from "./CardsRowScroll";
import { cookies } from "next/headers";
import { todayIso } from "@/lib/dates";
import { clampRailWidth } from "@/lib/bandDays";
import { getOverviewStart, getOverviewEnd, getPrimaryAdminId, getRequestPrices } from "@/lib/appSettings";
import { getBandDays } from "@/lib/bandDaysSetting";
import { BETA_FRAME_COLOR, adminColor } from "@/lib/orderFrame";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import OverviewBoard from "./OverviewBoard";
import OverviewFilters from "./OverviewFilters";
import { overviewHref, parseOverviewQuery } from "@/lib/overviewQuery";
import { seasonOrdersQuery, resourcesQuery } from "@/lib/overviewData";
import { parseSeasonKey, seasonOf, seasonsBetween, type Season } from "@/lib/season";
import { pageTitleStyle, selectStyle } from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

// 行高（ROW_HEIGHT / HEADER_ROW_HEIGHT）和画日历的那部分在 OverviewBoard.tsx

// 一条时间轴拉到底横着能滑很久，改成每 4 周折一段往下排（跟 Excel 里那张排期表一个思路）。
// 段的起点对齐到周一，所以每段正好是 4 个完整自然周。
// 每行几天现在跟着右边那道帘子走（lib/bandWeeks.ts），不再是写死的。
// 帘子收着的时候就是 28 天 —— 原来的样子。
// EXTRA_LANES / BAND_GAP 在 lib/bandDays.ts（匹配台那张日历共用同一份），
// 最后一段多留的空行（EXTRA_LANES_LAST）在 lib/overviewModel.ts

// 拖空白建单原来在这儿（Server Action createQuickOrder），2026-11-18 挪到 create-order/route.ts：
// Server Action revalidate 当前页会顺带整页重画，挪过去以后浏览器只拉新的那一单

// 拖色块边缘改日期原来在这儿（Server Action），已经挪到
// app/admin/overview/resize/route.ts —— 那条路上要拦「同一个资源同一天配两单」，
// 拦住时得把原因原样说给人听，而 Server Action 抛的错在生产环境会被换成
// 一句笼统的「服务器出错」。

async function deleteOrder(formData: FormData) {
  "use server";
  // 跟着这一单凭空多出来的客人（输错名字、选错身份）一起清掉，见 lib/deleteOrder.ts
  await deleteOrderAndStrayPerson(formData.get("order_id") as string);

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/matches");
  // 同原来的 createQuickOrder：不在这儿 redirect，那样会把跳转目标整页渲染完才返回，
  // 白等一个来回。跳转交给客户端，它点完就能立刻退出分配模式。
}

// 顶上那三个订单筛选（区域 / 地点 / 状态）共用一套尺寸 —— 宽度写死，
// 不让下拉框跟着最长选项撑开。同一个宽度只许有这一份（CLAUDE.md：
// 「第二份数字和第二份样式是同一个 bug」）。
// 110px 是量出来的：最长的那条默认值「RegionH」在 12px 下约 70px，
// 加箭头和内边距还剩十几 px 余量 —— 留够余量，不是「刚好够」。
const FILTER_SELECT_WIDTH = 110;
const filterSelectStyle: React.CSSProperties = {
  ...selectStyle,
  fontSize: 12,
  padding: "2px 4px",
  width: FILTER_SELECT_WIDTH,
  // 选项比框长的时候（地点的全称）截断，别把框顶开
  textOverflow: "ellipsis",
};

export default async function OverviewPage(
  props: {
    searchParams: Promise<{
      item?: string;
      gender?: string;
      sstatus?: string;
      q?: string;
      assign?: string;
      allcards?: string;
      region?: string;
      mtn?: string;
      ostatus?: string;
      /** 按「这一单是哪个管理员的」筛：管理员 id，或 none = 没标的 */
      oadmin?: string;
      sregion?: string;
      smtn?: string;
      ssort?: string;
      /** 看哪一季（lib/season.ts 的 key，25-26-na）。不写 = 今天所在的那季 */
      season?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const todayForSeason = todayIso();
  const currentSeason = seasonOf(todayForSeason);
  const season: Season = parseSeasonKey(searchParams.season) ?? currentSeason;
  const isCurrentSeason = season.key === currentSeason.key;
  // 开始查库之前的服务端时间（见 <main data-rendered-at>）
  const renderedAt = Date.now();

  const [
    { data: orders, error },
    { data: rawResources, error: resourceError },
    { data: orderNotes },
    { data: dayNotes },
    { data: earliestOrder },
    { data: latestOrder },
    overviewStart,
    overviewEnd,
    bandDaysSetting,
    admins,
    primaryAdminRaw,
    dayPrices,
  ] = await Promise.all([
    // 查哪几列在 lib/overviewData.ts：实时更新只拉变了的那几行时用的是同一份
    seasonOrdersQuery(season),
    resourcesQuery(),
    supabase.from("order_notes").select("order_id, internal_note"),
    // 日期条上「这一天的备注」。整张表拉下来：一天一行，一个季撑死两三百行
    supabase.from("day_notes").select("day, note"),
    // 季下拉列哪几季：最早那单到最晚那单，各取一行。数组按第一个元素排序 ——
    // 绝大多数单子的 demand_days 是从小到大存的，但订单列表页手填的那条路不保证，
    // 所以这只是近似：最坏漏掉一头那一季的入口（URL 上直接写 season 照样能看）。
    // 为这个去全表扫一遍就又回到全量读了，不值
    supabase.from("orders").select("demand_days").order("demand_days", { ascending: true }).limit(1),
    supabase.from("orders").select("demand_days").order("demand_days", { ascending: false }).limit(1),
    // 日历从哪天开始。**跟上面几条并排跑**，不要单独 await 一次 ——
    // 这一页渲染一次本来就要 0.6~1.3 秒，再串一个来回纯属白等
    getOverviewStart(),
    getOverviewEnd(),
    // 每行几天存 cookie，每台电脑各记各的（lib/bandDaysSetting.ts）
    getBandDays("overview"),
    // 标题旁边「当前身份」那个下拉的名单（一共几行，跟着并排跑不多等）
    loadAdmins(),
    getPrimaryAdminId(),
    // 每人每天默认单价（设置里），新建单预填用（lib/pricing.ts 的 defaultDayPrice）
    getRequestPrices(),
  ]);
  // 主要管理员：没写是谁的单子算他的，他的单不上色（lib/orderFrame.ts）
  const primaryAdminId = resolvePrimaryAdmin(primaryAdminRaw, admins);
  const currentAdmin = resolveAdmin((await currentAdminId()) ?? undefined, admins);
  // 标题旁边「全部 / Alpha / Beta」开关：单子、资源清单、建单的地点名提示一起跟着它（lib/itemMode.ts）
  const itemMode = parseItemMode((await cookies()).get(ITEM_MODE_COOKIE)?.value);

  // 季下拉：最早那单到最晚那单的每一季，再把今天这季和正在看的这季也算进去
  // （新的一季还没单子时也得能选到它）
  const boundDays = [...(earliestOrder ?? []), ...(latestOrder ?? [])]
    .flatMap((o: any) => o.demand_days ?? [])
    .sort();
  const seasonEnds = [
    currentSeason,
    season,
    ...(boundDays.length ? [seasonOf(boundDays[0]), seasonOf(boundDays[boundDays.length - 1])] : []),
  ].sort((a, b) => (a.start < b.start ? -1 : 1));
  const seasonOptions = seasonsBetween(seasonEnds[0], seasonEnds[seasonEnds.length - 1]);

  // 地址栏上的筛选怎么读、链接怎么拼：lib/overviewQuery.ts（浏览器那边切筛选时用的是同一份）
  const { resourceFilter: f, orderFilter } = parseOverviewQuery(new URLSearchParams(searchParams as Record<string, string>), admins);

  // 今天这季是默认，不写进 URL；认不出来的 season 参数也不往下传
  const seasonParam = isCurrentSeason ? "" : season.key;
  const qs = (extra: Record<string, string>) =>
    overviewHref(new URLSearchParams({ ...(searchParams as Record<string, string>), season: seasonParam }), extra);

  // 这一季的原始数据，交给浏览器（OverviewBoard）。日历范围、排行、冲突、统计、资源清单、
  // 色块数据都在 lib/overviewModel.ts 里算，服务端这儿不再算一遍
  // 服务端和浏览器用同一份（实时更新时浏览器拿合进来的新数据再算一遍）
  const raw = {
    orders: orders ?? [],
    resources: rawResources ?? [],
    orderNotes: orderNotes ?? [],
    dayNotes: dayNotes ?? [],
  };
  // 今天由服务端定：浏览器自己算的话跨日那几小时跟服务端不是同一天（CLAUDE.md）
  const today = todayIso();

  return (
    // data-rendered-at：这一次渲染开始查库时的服务端时间。退出分配态时先画上去的新值，
    // 等到「存完之后才开始查库」的那次渲染到了才撤（blockPatch.ts 的 settledPatches）
    <main data-rendered-at={renderedAt}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={pageTitleStyle}>排期总览</h1>
        <AdminSwitcher admins={admins} currentId={currentAdmin?.id ?? null} />
      </div>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      {/* 色块里的数字框不要那对上下箭头：一个箭头组要十几像素，三个框（男/女/金额）
          加起来将近 50——一天的单子色块只有一列宽，就是这 50px 让金额被挤出去。
          反正这几个数都是直接敲的，没人会去点箭头。
          Firefox 走 appearance:textfield（写在 style 里），Chrome/Safari 得干掉
          ::-webkit-*-spin-button 这个伪元素，只能用 CSS 写。 */}
      {/* 这段 CSS 必须用 dangerouslySetInnerHTML，不能写成 <style>{`...`}</style>。
          React 把 <style> 的文本子节点当普通文本转义，服务端会把 " 变成 &quot;；
          而 <style> 在 HTML 里是 raw text 元素，浏览器**不会**把 &quot; 还原回引号。
          结果两头对不上（hydration 报 "Text content does not match server-rendered
          HTML"），而且更要命的是选择器变成了 input[type=&quot;number&quot;]，
          什么都匹配不到——这条规则曾经整个是死的，上下箭头一直还在。
          dangerouslySetInnerHTML 原样输出，不转义。这里是写死的字符串，没有注入面。 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        #assign-active-block input[type="number"]::-webkit-outer-spin-button,
        #assign-active-block input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          appearance: none;
          margin: 0;
        }
        /* 一天的单子色块只有一列宽（COL_WIDTH，150px），第 3 行放不下「男x/y 女x/y + 状态 + 金额」。
           这时候把状态下拉框和删除叉都藏掉（132px 时实测第 3 行溢出 31px；
           加宽到 150 之后仍然放不下），
           只留分配进度和金额——那两个数才是排期时要看的。
           状态看色块颜色就知道；删除一天的单子去 Order 列表页，
           或者先把单子拉宽再删。
           备注框不用藏——它在第 1 行，那一行只有姓名和地点，挤得下。
           用容器查询而不是媒体查询：判断依据是这个色块自己有多宽（几天的单子），
           跟浏览器窗口多宽没关系。180 这个数落在「一天」(内容宽 138) 和
           「两天」(288) 中间，判得干脆。 */
        /* 分配模式下「已配的资源」这一行可以横着滚，把够不着的人划出来撤销。
           只给编辑中的这个色块开：日历最主要的手势就是左右拖，要是每个色块
           都吃掉横向滑动，整张表就没法平移了。
           滚动条要藏掉——这一行只有 14px 高，一条横向滚动条就把它吃没了。
           右边缘做一点淡出，当作「后面还有」的提示（本来是省略号的活儿，
           但省略号跟 overflow:auto 不能共存）；没溢出时那 10px 是空的，看不出来。 */
        #assign-active-block .cards-row {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 10px), rgba(0,0,0,0.25));
          mask-image: linear-gradient(to right, #000 calc(100% - 10px), rgba(0,0,0,0.25));
        }
        #assign-active-block .cards-row::-webkit-scrollbar { display: none; }

        /* 资源清单上「已排 …」那一行：单行，超出部分横着滚。
           右边渐隐是在说「后面还有」，比省略号更省地方 */
        .booked-row {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          /* 不做边缘渐隐：那层朦胧看着像没加载完，反而比硬切一刀更碍眼。
             溢出与否，滑一下就知道了 */
        }
        .booked-row::-webkit-scrollbar { display: none; }

        /* 备注框平时只占一个小方块（姓名和地点优先，它俩每单都有），
           点进去自动撑到一半宽好打字，挪走又缩回去。
           transition 让这一下不至于跳得太突兀。 */
        /* 输入框宽度贴着内容走（field-sizing:content），**不设 min-width** ——
           设了的话名字/地点名短的时候框比文字宽，后面的东西整体右移，
           进出编辑就又在动了。只有**空着**的时候才需要一个点得中的宽度，
           靠 :placeholder-shown 区分「空着」和「填了但很短」。 */
        #assign-active-block .assign-fit { min-width: 0; }
        #assign-active-block .assign-fit:placeholder-shown {
          min-width: var(--fit-empty, 28px);
        }

        #assign-active-block .assign-note { transition: min-width 120ms ease-out; }
        #assign-active-block .assign-note:focus-within { min-width: 55% !important; }

        @container (max-width: 180px) {
          /* 一天的单子（内宽 136px）曾经把状态下拉框整个藏掉 —— 等于一天的单子
             改不了状态。其实装得下，卡在那只 ▾ 上：带箭头的 select 要 59px 才
             显示得全「已分配」，去掉箭头只要 39px，而这儿能匀出 42.6px。
             所以窄色块上只去掉箭头，框还在、照样点得开。
             （跟地点名那个 <input list> 藏掉 ▾ 是同一个理由：几十像素宽的地方，
             一个箭头就占掉一半还挡字。） */
          #assign-active-block .assign-status select {
            appearance: none !important;
            -webkit-appearance: none !important;
            /* 自己的左右内边距也收到 1px：省下的 2px 是**需求侧**的，
               比在别处硬挤 2px 出来安全 */
            padding: 0 1px !important;
          }
          /* $ 符号还是要藏：不藏的话金额右边会被切掉 9px，
             「$120」看成「$12」比少个符号严重得多。旁边就是「男1/1 女0/1」，
             最右边那个数是钱，不会认错。
             **不限定 #assign-active-block**：普通态也要一起藏，不然窄色块
             进出编辑一个有 $ 一个没有 */
          .assign-money-sign { display: none !important; }
        }
`,
        }}
      />

      {/* 多选 + 批量改状态。它不渲染色块，只是全局听点击、注入一条高亮的 CSS，
          所以放在哪一层都行——放这儿是为了让浮动工具条脱离日历的滚动容器。 */}
      <BulkSelect />
      {/* 让分配模式那一行的「已配的资源」能用纵向滚轮横着滚，够到后面的人 */}
      <CardsRowScroll />
      {/* 从左边把资源拖到订单色块上分配。分配模式开不开都能用 */}
      <DragAssign />
      <DragMove />
      {/* 点色块进分配模式的即时反馈：整页重渲染要 420ms，这层先把「点到了」画出来 */}
      <OptimisticAssign />
      {/* 填地点名的输入框共用这一份补全列表 */}

      {/* 统计 / 状态图例 / 缩放 / 资源面板 / 日历：数据和怎么画都在 OverviewBoard（浏览器里）——
          它拿这一季的原始数据自己算（lib/overviewModel.ts），实时更新时只合进变了的那几行再算。
          服务端只画筛选那一排和图例（跟数据无关），连同原始数据一起交下去 */}
      <OverviewBoard
        raw={raw}
        renderedAt={renderedAt}
        params={{
          season,
          isCurrentSeason,
          today,
          itemMode,
          admins,
          primaryAdminId,
          orderFilter,
          resourceFilter: f,
          bandDays: bandDaysSetting,
          overviewStart,
          overviewEnd,
        }}
        railWidth={clampRailWidth(Number((await cookies()).get("overview_rail_width")?.value ?? NaN))}
        serverAssigningId={searchParams.assign ?? null}
        resourcePanel={{
          season: seasonParam,
          // 收起状态服务端读 cookie 当初始值，首屏不会先展开再收起闪一下
          initialCollapsed: (await cookies()).get("resource_panel_collapsed")?.value === "1",
          // 筛选默认收起：平时都是直接看资源列表，筛选是偶尔为之
          filtersCollapsed: (await cookies()).get("resource_filters_collapsed")?.value !== "0",
          loadError: resourceError?.message,
        }}
        newOrder={{
          adminName: currentAdmin?.name ?? null,
          adminId: currentAdmin?.id ?? null,
          dayPrices,
        }}
        instant={{
          exitHref: qs({ assign: "" }),
          deleteAction: deleteOrder,
        }}
        // 这两段在 OverviewBoard 里跟统计排在同一行：React 19 dev 下服务端交下去的元素跟别的并排时要 key，
        // 不然控制台报「缺 key」（ResourcePanel 那个 key 是同一个原因）
        filters={
          <OverviewFilters
            key="filters"
            seasonOptions={seasonOptions.map((x) => ({ key: x.key, label: x.label }))}
            currentSeasonKey={currentSeason.key}
            seasonParam={seasonParam}
            admins={admins}
            primaryAdminId={primaryAdminId}
            itemMode={itemMode}
            selectStyle={filterSelectStyle}
          />
        }
        legend={
        <div key="legend" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const c = statusColor(key);
            return (
              <span
                key={key}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  color: c.text,
                }}
              >
                {label}
              </span>
            );
          })}
          {/* 管理员的边框颜色图例：只列**非主要管理员**（只有他们的单上色） */}
          {admins
            .filter((a) => a.id !== primaryAdminId)
            .map((a) => {
              const color = adminColor(a.id, admins, primaryAdminId);
              return (
                <span
                  key={a.id}
                  data-admin-legend={a.name}
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: `1px solid ${color}`,
                    boxShadow: `inset 0 0 0 1px ${color}`,
                    color: "var(--text-muted)",
                  }}
                >
                  {a.name} 的单
                </span>
              );
            })}
          {/* Beta 的单边框一律青色；非主要管理员的 Beta 单青边里面再一圈他的颜色（lib/orderFrame.ts） */}
          <span
            data-beta-legend
            style={{
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 4,
              border: `1px solid ${BETA_FRAME_COLOR}`,
              boxShadow: `inset 0 0 0 1px ${BETA_FRAME_COLOR}`,
              color: "var(--text-muted)",
            }}
          >
            {(() => {
              const primary = admins.find((a) => a.id === primaryAdminId);
              return primary ? `${primary.name} 的 Beta 单` : "Beta 的单";
            })()}
          </span>
          {admins
            .filter((a) => a.id !== primaryAdminId)
            .map((a) => (
              <span
                key={a.id}
                data-beta-admin-legend={a.name}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${BETA_FRAME_COLOR}`,
                  boxShadow: `inset 0 0 0 1px ${adminColor(a.id, admins, primaryAdminId)}`,
                  color: "var(--text-muted)",
                }}
              >
                {a.name} 的 Beta 单
              </span>
            ))}
        </div>
        }
      />
    </main>
  );
}

