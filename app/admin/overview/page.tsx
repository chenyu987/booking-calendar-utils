import { Fragment } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson } from "@/lib/people";
import { deleteOrder as deleteOrderAndStrayPerson } from "@/lib/deleteOrder";
import { CONTACT_FILTER_NONE, parseOrderAdminFilter, resolveAdmin, resolvePrimaryAdmin } from "@/lib/admins";
import { addContact, loadAdmins } from "@/lib/personContacts";
import AdminSwitcher from "./AdminSwitcher";
import { currentAdminId } from "@/lib/adminSession";
import ItemModeSwitcher from "./ItemModeSwitcher";
import { ITEM_MODE_COOKIE, parseItemMode } from "@/lib/itemMode";
import DragAssign from "./DragAssign";
import DragMove from "./DragMove";
import OptimisticAssign from "./OptimisticAssign";
import FilterForm from "@/app/admin/orders/FilterForm";
import BulkSelect from "./BulkSelect";
import CardsRowScroll from "./CardsRowScroll";
import { cookies } from "next/headers";
import { parseResourceSort, RESOURCE_SORTS, DEFAULT_RESOURCE_SORT, type ResourceSort } from "@/lib/resourceSort";
import { todayIso } from "@/lib/dates";
import { clampRailWidth } from "@/lib/bandDays";
import { getOverviewStart, getOverviewEnd, getPrimaryAdminId, getRequestPrices } from "@/lib/appSettings";
import { getBandDays } from "@/lib/bandDaysSetting";
import { BETA_FRAME_COLOR, adminColor } from "@/lib/orderFrame";
import { statusColor, STATUS_LABELS } from "@/lib/orderStatus";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import OverviewBoard, { ASSIGN_ID_PLACEHOLDER } from "./OverviewBoard";
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

async function createQuickOrder(formData: FormData) {
  "use server";
  const customerName = ((formData.get("customer_name") as string) ?? "").trim();
  if (!customerName) throw new Error("客人姓名不能为空");

  const location = ((formData.get("location") as string) ?? "").trim() || null;
  const note = ((formData.get("note") as string) ?? "").trim();
  const maleCount = Number(formData.get("male_count") ?? 0) || 0;
  const femaleCount = Number(formData.get("female_count") ?? 0) || 0;
  const demandDays = JSON.parse((formData.get("demand_days") as string) ?? "[]") as string[];
  if (demandDays.length === 0) throw new Error("日期不能为空");
  const amountRaw = ((formData.get("amount") as string) ?? "").trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);


  // 当前身份（标题旁边那个下拉；没切过就是登录的那个人，middleware 定的）：这单的客人记成这个管理员的
  // （= 哪个账号加的，以后找人知道用谁的号）。id 得在库里真有这个人，
  // 不然记下的归属指向一个不存在的管理员。**跟找客人那条查询并排跑**，不多等一个来回
  const adminId = (await currentAdminId()) ?? "";
  const findAdmin = async () => {
    if (!adminId) return null;
    const { data } = await supabase.from("admins").select("id").eq("id", adminId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  // 同名客人复用，找不到就现建一个 —— 快速建单不打断流程去 Customer 页面
  // 名字在 people 上，但只在**客户**里找（!inner = 没有 customers 这一行的人不算）——
  // 同名的物主不该被顺手拉来下单
  const findCustomer = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, people!inner(chat_name)")
      .ilike("people.chat_name", customerName)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const [admin, existingCustomerId] = await Promise.all([findAdmin(), findCustomer()]);
  // 拦在任何写库之前。界面上没选身份时「创建」是灰的，这里拦的是旧页面和直接 POST
  if (!admin) throw new Error("还没选当前身份（排期总览标题旁边），选了才知道这个客人记在谁名下");

  // 建单弹窗里填的「客人」就是昵称（0020）—— 后台认人、显示都靠它
  const customerId = existingCustomerId ?? (await createPerson("customer", { chat_name: customerName }));
  // 老客人原来是别人加的也照样补上（别人的保留）：能给他建单，说明这个号也联系得上他。
  // 放在建单之前：这步失败就整个停住，不留一个建好了却没记归属的单子
  await addContact(customerId, admin);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      // 这一单是谁的（0019）：当前身份。排期总览按它筛
      admin_id: admin,
      location,
      male_count: maleCount,
      female_count: femaleCount,
      demand_days: demandDays,
      amount,
      status: "created",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 备注存在 order_notes 里（表本来就有，跟 orders 一对一），不往 orders 上加字段。
  // 填了才写，多一次写库就多一个 Supabase 来回（0.4~2 秒），没填就别浪费这个时间。
  // 这一步失败不往上抛：订单其实已经建好了，抛上去客户端会显示"建单失败"，
  // 比丢一条备注更误导人——备注可以进分配模式重填。
  if (note) {
    await supabase.from("order_notes").insert({ order_id: order.id, internal_note: note });
  }

  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  // 这里不 redirect：server action 里的 redirect 会顺带把跳转目标整页渲染完再返回，
  // 客户端得一路等着（实测 3~5 秒，全程卡在"建单中…"）。改成把新单子 id 还回去，
  // 让客户端自己跳——弹窗可以先关掉，不用对着按钮干等。
  return order.id as string;
}

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
  // 同 createQuickOrder：不在这儿 redirect，那样会把跳转目标整页渲染完才返回，
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

  const f = {
    item: searchParams.item ?? "",
    gender: searchParams.gender ?? "",
    sstatus: searchParams.sstatus || "active",
    q: (searchParams.q ?? "").trim().toLowerCase(),
    // 上次去的区域 / 具体的地点。"none" 是「只看还没排过的」那一档
    sregion: searchParams.sregion ?? "",
    smtn: searchParams.smtn ?? "",
  };
  const sortBy = parseResourceSort(searchParams.ssort);

  const orderFilter = {
    region: (searchParams.region ?? "") as Region | "",
    mtn: searchParams.mtn ?? "",
    status: STATUS_LABELS[searchParams.ostatus ?? ""] ? searchParams.ostatus! : "",
    // 这一单是哪个管理员的（orders.admin_id，0019）。跟状态一样，日历和统计一起筛 ——
    // 「只看我的单」就该看到我的单的钱
    admin: parseOrderAdminFilter(searchParams.oadmin, admins),
  };
  const hasOrderFilter = Boolean(
    orderFilter.region || orderFilter.mtn || orderFilter.status || orderFilter.admin
  );

  // 今天这季是默认，不写进 URL；认不出来的 season 参数也不往下传
  const seasonParam = isCurrentSeason ? "" : season.key;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (seasonParam) p.set("season", seasonParam);
    if (f.item) p.set("item", f.item);
    if (f.gender) p.set("gender", f.gender);
    if (f.sstatus !== "active") p.set("sstatus", f.sstatus); // active 是默认，不写进 URL
    if (f.q) p.set("q", f.q);
    if (f.sregion) p.set("sregion", f.sregion);
    if (f.smtn) p.set("smtn", f.smtn);
    // 默认那档不写进 URL，链接短一点；parseResourceSort 拿不到也会退回默认
    if (searchParams.ssort && searchParams.ssort !== DEFAULT_RESOURCE_SORT) {
      p.set("ssort", searchParams.ssort);
    }
    if (searchParams.assign) p.set("assign", searchParams.assign);
    if (searchParams.allcards) p.set("allcards", searchParams.allcards);
    if (searchParams.region) p.set("region", searchParams.region);
    if (searchParams.mtn) p.set("mtn", searchParams.mtn);
    if (searchParams.ostatus) p.set("ostatus", searchParams.ostatus);
    if (searchParams.oadmin) p.set("oadmin", searchParams.oadmin);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/admin/overview?${s}` : "/admin/overview";
  };

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
          assignHrefTemplate: qs({ assign: ASSIGN_ID_PLACEHOLDER }),
        }}
        railWidth={clampRailWidth(Number((await cookies()).get("overview_rail_width")?.value ?? NaN))}
        serverAssigningId={searchParams.assign ?? null}
        resourcePanel={{
          orderRegion: orderFilter.region,
          orderMtn: orderFilter.mtn,
          season: seasonParam,
          showAllCards: searchParams.allcards === "1",
          showAllHref: qs({ allcards: "1" }),
          hideUnusableHref: qs({ allcards: "" }),
          sortBy,
          // 四条链接在服务端拼好传下去 —— URL 怎么拼是 qs 的事，菜单只管点
          sortHrefs: Object.fromEntries(
            (Object.keys(RESOURCE_SORTS) as ResourceSort[]).map((k) => [
              k,
              qs({ ssort: k === DEFAULT_RESOURCE_SORT ? "" : k }),
            ])
          ) as Record<ResourceSort, string>,
          // 收起状态服务端读 cookie 当初始值，首屏不会先展开再收起闪一下
          initialCollapsed: (await cookies()).get("resource_panel_collapsed")?.value === "1",
          // 筛选默认收起：平时都是直接看资源列表，筛选是偶尔为之
          filtersCollapsed: (await cookies()).get("resource_filters_collapsed")?.value !== "0",
          loadError: resourceError?.message,
        }}
        newOrder={{
          createOrderAction: createQuickOrder,
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
          <Fragment key="filters">
        {/* 按区域 / 具体的地点筛订单。用 GET 表单不用 useState —— 跟这个项目里
            其它筛选一个路子，筛选状态留在 URL 上，刷新和分享链接都还在。
            选完自动提交（onChange 交给 FilterAutoSubmit，跟资源筛选共用）。 */}
        {/* 外面再包一层同样 gap 的 flex：类型开关在表单外面（见下），不包的话它跟前面那排下拉
            之间隔的是外层的大间距，看着像另一组 */}
        {/* ov-filters：手机上这一排换行（lib/adminMobile.ts），桌面不变 */}
        <div className="ov-filters" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <FilterForm action="/admin/overview" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* 看哪一季。放最前面：它决定读哪批数据，后面几个筛选都是在这一季里面再筛。
              今天这季的选项值是空的 —— 默认那档不写进 URL（FilterForm 会剔掉空值） */}
          <select
            key={`season-${season.key}`}
            name="season"
            defaultValue={seasonParam}
            style={filterSelectStyle}
            aria-label="季"
          >
            {seasonOptions.map((s) => (
              <option key={s.key} value={s.key === currentSeason.key ? "" : s.key}>
                {s.label}
                {s.key === currentSeason.key ? "（本季）" : ""}
              </option>
            ))}
          </select>
          {/* 资源面板那边的筛选也在 URL 上，这个表单一提交就会把它们冲掉，
              所以原样带过去 */}
          {f.item && <input type="hidden" name="item" value={f.item} />}
          {f.gender && <input type="hidden" name="gender" value={f.gender} />}
          {f.sstatus !== "active" && (
            <input type="hidden" name="sstatus" value={f.sstatus} />
          )}
          {f.q && <input type="hidden" name="q" value={f.q} />}
          {searchParams.ssort && (
            <input type="hidden" name="ssort" value={searchParams.ssort} />
          )}
          {searchParams.assign && (
            <input type="hidden" name="assign" value={searchParams.assign} />
          )}
          {/* key 不能省：defaultValue 只在挂载时读一次，URL 上的参数变了（比如建完
              新单把筛选清掉了）而 DOM 节点被复用，下拉框会一直显示旧值 ——
              看起来就像「筛选还开着但没生效」。把值拼进 key，值一变就重新挂载。
              CLAUDE.md 里分配输入框那段记的是同一个坑。 */}
          <select
            key={`region-${orderFilter.region}`}
            name="region"
            defaultValue={orderFilter.region}
            style={filterSelectStyle}
          >
            <option value="">全部区域</option>
            {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
          {/* 地点这个下拉原来是**跟着最长的那条选项撑开**的（"全部地点" 才 4 个字，
              框却有 200 多 px），一个人看过去还以为是搜索框。三个筛选共用
              filterSelectStyle 的固定宽度，一条线上对齐。
              选项文字也从 `canonical · label` 收成只留 label —— 两者九成情况下
              就是同一个词（locbl · Locbl），显示两遍纯粹是把框撑长。 */}
          <select
            key={`mtn-${orderFilter.mtn}`}
            name="mtn"
            defaultValue={orderFilter.mtn}
            style={filterSelectStyle}
          >
            <option value="">全部地点</option>
            {LOCATION_OPTIONS.filter(
              (m) =>
                (!orderFilter.region || m.region === orderFilter.region) &&
                (!itemMode || m.item === itemMode)
            ).map((m) => (
              <option key={m.value} value={m.value} title={m.hint}>
                {m.label}
              </option>
            ))}
          </select>
          {/* 按订单状态筛。下面那排色块只是图例（看颜色对应哪个状态），
              真要「只看待付款的单」得有个地方选 —— 就是这里。
              选项顺序直接吃 STATUS_LABELS，跟图例、跟色块里的下拉框同一个源。 */}
          <select
            key={`ostatus-${orderFilter.status}`}
            name="ostatus"
            defaultValue={orderFilter.status}
            style={filterSelectStyle}
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {/* 这一单是哪个管理员的。名单跟标题旁边「当前身份」是同一份（admins 表），
              以后加了员工这里自动多一项。「没标」= 以前的单、客户自己发的需求 */}
          <select
            key={`oadmin-${orderFilter.admin}`}
            name="oadmin"
            defaultValue={orderFilter.admin}
            style={filterSelectStyle}
          >
            <option value="">全部管理员</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {/* 设了主要管理员之后，没写是谁的单都算他的，就不存在「没标」了 */}
            {!primaryAdminId && <option value={CONTACT_FILTER_NONE}>没标</option>}
          </select>
          {hasOrderFilter && (
            <Link
              href={qs({ region: "", mtn: "", ostatus: "", oadmin: "" })}
              style={{ fontSize: 12, color: "var(--text-faint)" }}
            >
              清除
            </Link>
          )}
        </FilterForm>
        {/* 「全部 / Alpha / Beta」开关。存 cookie 不走 URL，所以放在表单外面（见 ItemModeSwitcher） */}
        <ItemModeSwitcher mode={itemMode} style={filterSelectStyle} />
        </div>
          </Fragment>
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

