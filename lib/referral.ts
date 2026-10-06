import { displayName } from "./person";
import { countsTowardRevenue, orderStartDay } from "./revenue";
import { formatDateRange } from "./resourceStatus";
import { isIsoDate } from "./timelineStart";

// 介绍人返点。A 介绍 B 来租借，B 每下一单就给 A 一笔返点。
//
// **两件事要分清楚，这是这个模块的全部设计：**
//
//   「该返多少」= 订单金额 × 比例 —— **算出来的，不存**。订单金额会变
//     （排期总览上拖一下天数就走 rescaleAmount 重算），存成字段迟早对不上。
//   「真付出去了」= referral_payouts 里的一行 —— **事实，必须存**。
//
// 跟 matches（想配）vs order_assignments（真配上了）是同一个划分。
//
// 关系本身存在**被介绍人**那一行（customers.referred_by），比例快照也在那一行
// （customers.referral_rate，意思是「这个人的单子按这个比例返给他的介绍人」）。
// 为什么不在介绍人那行存一个「我介绍了谁」的数组，见迁移 0014 的注释。

/** 全局默认比例。库里没设过 app_settings.referral_rate_default 时用这个 */
export const DEFAULT_REFERRAL_RATE = 0.1;

export type ReferralCustomer = {
  id: string;
  /** 昵称：认人、显示都靠它（0020） */
  chat_name?: string | null;
  /** 账号，选填 */
  chat_id?: string | null;
  /** 注册用户自己填的称呼，大多数人是空的 */
  first_name?: string | null;
  last_name?: string | null;
  /** 谁介绍了这个人 */
  referred_by?: string | null;
  /** 这个人的单子按几成返给介绍人。null = 跟随全局默认 */
  referral_rate?: number | string | null;
  /** 返点生效窗口，两头各自可空，空 = 这一头不设限（迁移 0015） */
  referral_from?: string | null;
  referral_until?: string | null;
};

export type ReferralOrder = {
  id: string;
  customer_id: string;
  demand_days?: string[] | null;
  location?: string | null;
  amount?: number | string | null;
  status?: string | null;
};

export type ReferralPayout = {
  order_id: string;
  referrer_id: string;
  amount?: number | string | null;
};

/** 库里的 numeric 走 PostgREST 回来是字符串，统一在这儿收口 */
function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 显示名走 lib/person.ts 的 displayName（唯一出处）：昵称优先 */
export function customerName(r: ReferralCustomer | undefined): string {
  if (!r) return "?";
  return displayName(r, r.id.slice(0, 8));
}

/**
 * 这一单实际按几成返。比例存在**被介绍人**那一行上（建立关系时的快照），
 * 留空才跟随全局默认 —— 这样改全局默认不会把已经谈好的老关系一起改掉。
 */
export function effectiveRate(
  referee: ReferralCustomer | undefined,
  defaultRate: number = DEFAULT_REFERRAL_RATE
): number {
  const own = toNum(referee?.referral_rate);
  return own === null ? defaultRate : own;
}

/** 0.1 → "10%"。比例只在这儿转成人话，别在组件里自己乘 100 */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}

/**
 * 界面上填的是百分数（10），库里存小数（0.1）。
 * 空着 = 跟随全局默认，是合法输入，**跟「填了个乱七八糟的东西」要分开**——
 * 都当成 null 的话，把 "abc" 填进去会静悄悄变成默认比例，没人发现填错了。
 */
export function parseRatePercent(
  raw: unknown
): { ok: true; rate: number | null } | { ok: false; reason: string } {
  const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
  if (s === "") return { ok: true, rate: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, reason: "返点比例要填数字" };
  if (n < 0 || n > 100) return { ok: false, reason: "返点比例要在 0~100 之间" };
  // numeric(5,4)：百分数最多两位小数，转成小数正好四位
  return { ok: true, rate: Math.round(n * 100) / 10000 };
}

/**
 * 从某个人往上追介绍链：[他的介绍人, 介绍人的介绍人, ...]。
 * 带 seen 兜底 —— 库里万一已经存在环（直接改库、或者以前漏了校验），
 * 这里不能转死循环。
 */
export function referralChain(
  customerId: string,
  byId: Map<string, ReferralCustomer>
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([customerId]);
  let cur = byId.get(customerId)?.referred_by ?? null;
  while (cur && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    cur = byId.get(cur)?.referred_by ?? null;
  }
  return chain;
}

/**
 * 「能不能把 referrer 记成 referee 的介绍人」—— 建立介绍关系的全部校验，**唯一出处**。
 *
 * 跟 assignBlockReason 一样的定位：能返 null 就是能建，不能建就返一句人话。
 * 界面上藏不藏按钮是另一回事，写库前一律调这里。
 *
 * @returns 能建返回 null，不能建返回原因
 */
export function referralBlockReason(input: {
  refereeId: string;
  referrerId: string;
  byId: Map<string, ReferralCustomer>;
}): string | null {
  const { refereeId, referrerId, byId } = input;
  if (!refereeId || !referrerId) return "介绍人和被介绍人都要选";

  const referee = byId.get(refereeId);
  const referrer = byId.get(referrerId);
  if (!referee) return "找不到被介绍人";
  if (!referrer) return "找不到介绍人";

  if (refereeId === referrerId) return "不能自己介绍自己";

  // 已经有介绍人时不许直接改成另一个人：返点是按关系现算的，换个人等于把
  // 这个人**所有历史单子**的返点一起挪走。要改先解除，让这一下是明摆着的。
  const current = referee.referred_by ?? null;
  if (current && current !== referrerId) {
    return `${customerName(referee)} 已经记着是 ${customerName(byId.get(current))} 介绍的，要改先解除`;
  }
  if (current === referrerId) return "这条介绍关系已经有了";

  // 成环：A 介绍 B、B 又介绍 A，两个人互相给对方返点，永远算不完。
  // 库的 check 只拦得住自己介绍自己，长一点的环得在这儿走一遍链子。
  if (referralChain(referrerId, byId).includes(refereeId)) {
    return `会绕成环：${customerName(referrer)} 那条链上已经有 ${customerName(referee)} 了`;
  }

  return null;
}


/**
 * 「terence 被 denton 介绍」—— 界面上是拿**昵称**指人的，这里把它翻成 id。
 *
 * 为什么不用下拉选 id：一季几百个客户，下拉里翻名字比直接打昵称慢得多，
 * 而且平时在群里、在 Sheet 上认人本来就是认昵称。
 *
 * 先按昵称匹配，没匹配上再按账号，再退回按注册时填的称呼（0020 起昵称是主键一样的东西，
 * 但以后自己注册、还没被管理员加过昵称的人只有称呼）。
 * **对不上或者对上多个都返错误，不猜。** 猜错一个人，返点就长期发给错的人，
 * 而且不会有人发现（台账上看着是对的）。
 */
export function resolveCustomer(
  raw: unknown,
  customers: ReferralCustomer[]
): { ok: true; id: string } | { ok: false; reason: string } {
  const q = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!q) return { ok: false, reason: "昵称没填" };

  const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();
  // 一档一档往下找，**哪一档对上了就只看那一档**：昵称对上一个人，就不管别人的称呼恰好也叫这个
  const tiers = [
    (r: ReferralCustomer) => norm(r.chat_name) === q,
    (r: ReferralCustomer) => norm(r.chat_id) === q,
    (r: ReferralCustomer) => {
      const full = [r.first_name, r.last_name].filter(Boolean).join(" ").trim().toLowerCase();
      return full === q || norm(r.first_name) === q;
    },
  ];
  const hits = tiers.map((t) => customers.filter(t)).find((list) => list.length > 0) ?? [];

  if (hits.length === 0) {
    return { ok: false, reason: `找不到「${String(raw).trim()}」这个人，先去 Customer 页建档` };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      reason: `「${String(raw).trim()}」对应到 ${hits.length} 个人，先去 Customer 页把重复的合并`,
    };
  }
  return { ok: true, id: hits[0].id };
}

/** 选人框里的候选项：昵称（平时就是拿它认人的）。跟 customerName 是同一个 —— 都走 displayName */
export function customerHandle(r: ReferralCustomer): string {
  return customerName(r);
}

// —— 返点生效窗口（迁移 0015）——
//
// 资源的是**活动日**（订单最早的那个需求日，orderStartDay），不是下单日。
// 跨界的单子整单算进开始那天所在的一侧、**不按天拆** —— 这是 revenue.ts 顶上
// 已经定死的口径（拆的话同一单的钱会出现在窗口两边，加起来对不上总数），
// 返点跟流水用同一把尺，两边的数才对得上。

/**
 * 这一单的活动日在不在这条关系的返点窗口里。
 * 两头闭区间；那一头留空就是不设限。
 *
 * **窗口设了、但这一单没填需求日 → 不算。** 没有日期就落不进一个按日期切的窗口。
 * 反过来没设窗口时照常算（连一个没日期的单也算），两种情况都有测试盯着。
 * 行不会消失，界面上标成「窗口外」，人看见了可以去把日期补上。
 */
export function withinReferralWindow(
  startDay: string | null,
  referee: { referral_from?: string | null; referral_until?: string | null } | undefined
): boolean {
  const from = referee?.referral_from ?? null;
  const until = referee?.referral_until ?? null;
  if (!from && !until) return true;
  if (!startDay) return false;
  return (!from || startDay >= from) && (!until || startDay <= until);
}

/** 窗口怎么显示。走 resourceStatus 的 formatDateRange —— 跟资源有效期同一份代码 */
export function formatReferralWindow(referee: {
  referral_from?: string | null;
  referral_until?: string | null;
}): string {
  return formatDateRange(referee.referral_from, referee.referral_until);
}

/**
 * 界面填进来的两个日期。空 = 这一头不设限，是合法输入；
 * 填了个不是日期的东西要报错，**别跟「空着」混成一件事** —— 混了的话
 * 填错的那一头会静悄悄变成「不设限」，窗口比你以为的宽，返点多付出去了都没人知道。
 *
 * 起点晚于终点也在这儿拦：那样窗口是空的，所有单子都不算返点，
 * 而界面上看着「明明设了窗口」。
 */
export function parseReferralWindow(
  rawFrom: unknown,
  rawUntil: unknown
):
  | { ok: true; from: string | null; until: string | null }
  | { ok: false; reason: string } {
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const f = norm(rawFrom);
  const u = norm(rawUntil);
  if (f && !isIsoDate(f)) return { ok: false, reason: `返点窗口起点「${f}」不是个日期` };
  if (u && !isIsoDate(u)) return { ok: false, reason: `返点窗口终点「${u}」不是个日期` };
  if (f && u && f > u) return { ok: false, reason: `返点窗口填反了：${f} 晚于 ${u}` };
  return { ok: true, from: f || null, until: u || null };
}

/** 这一单为什么不算返点。null = 算 */
export type SkipReason = "status" | "window" | null;

/** 不算的原因显示成什么 —— 唯一出处，台账那一格和别处都取这儿 */
export const SKIP_LABELS: Record<Exclude<SkipReason, null>, string> = {
  status: "不计",
  window: "窗口外",
};

/**
 * 选人框的候选。**打了字才给，空着不给** —— 一聚焦就把全部几百人倒出来，
 * 那不是补全是干扰，真要的那个名字还得在里面翻。
 *
 * 跟 resolveCustomer 是一对：这个负责**模糊**地给候选（子串、聊天和姓名都认），
 * resolveCustomer 负责**精确**地认人。两个都要有：候选宽松才好找，
 * 认人严格才不会把返点发给错的人。
 *
 * 前缀命中排在包含命中前面（打 "den" 先看到 denton，而不是 "xxdenyy"）。
 */
export function suggestCustomers(
  query: string,
  customers: ReferralCustomer[],
  limit = 8
): ReferralCustomer[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { r: ReferralCustomer; rank: number }[] = [];
  for (const r of customers) {
    const handle = customerHandle(r).toLowerCase();
    // 注册时自己填的称呼也能搜 —— 显示名是昵称，但有人记的是他的称呼
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim().toLowerCase();
    // 账号也能搜：打的是号的时候也找得到人
    const chat = (r.chat_id ?? "").trim().toLowerCase();
    let rank = -1;
    if (handle.startsWith(q) || chat.startsWith(q)) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (handle.includes(q) || chat.includes(q) || name.includes(q)) rank = 2;
    if (rank >= 0) scored.push({ r, rank });
  }

  scored.sort(
    (a, b) => a.rank - b.rank || customerHandle(a.r).localeCompare(customerHandle(b.r))
  );
  return scored.slice(0, limit).map((x) => x.r);
}

/** 返点台账上的一行：某一单该给某个介绍人返多少、付了没有 */
export type RebateRow = {
  orderId: string;
  referrerId: string;
  refereeId: string;
  refereeName: string;
  /** 被介绍人的账号（选填），显示在名字旁边 */
  refereeChatId: string;
  location: string;
  startDay: string | null;
  /** 需求日原样带出来 —— 台账上显示「9/10–9/11」比「2 天」有用 */
  days: string[];
  orderStatus: string;
  orderAmount: number | null;
  rate: number;
  /** 该返多少。不算钱的单（取消/未确认）是 0 */
  rebate: number;
  /** 这单算不算钱 —— 口径直接调 revenue.ts，跟流水永远一致 */
  counts: boolean;
  /** 不算的话是因为什么。界面要能分清「单子黄了」和「不在返点窗口里」 */
  skipReason: SkipReason;
  /** 已经付出去多少（referral_payouts 里的事实） */
  paid: number;
  hasPayout: boolean;
};

/**
 * 这一笔算不算「已经该付了」。
 *
 * 返点是**单子用完了才该给**的，所以待付只算到某一天为止（界面上传的是本周日，
 * 跟 lib/revenue.ts 那三个流水数字同一个收口点）。往后的单子先不计入。
 *
 * 归属按最早那个活动日，跟流水一样**整单算进一侧、不按天拆**。
 * 没填需求日的落不进一个按日期切的窗口，归到「还没发生」那边。
 *
 * **唯一出处** —— 顶上的统计和日历那条汇总都调它，别各写一遍。
 */
export function isDueBy(row: { startDay: string | null }, through: string): boolean {
  return !!row.startDay && row.startDay <= through;
}

/** 还欠这一笔多少。已付超出的（单子后来改小了）不算负数往回冲 */
export function outstandingOf(row: RebateRow): number {
  return round2(Math.max(0, row.rebate - row.paid));
}

/**
 * 付过返点、单子后来又黄了。台账上要单独标出来 —— 钱已经出去了，
 * 光把这行从列表里去掉的话，这笔账就凭空消失了。
 */
export function isPayoutOnDeadOrder(row: RebateRow): boolean {
  return row.hasPayout && !row.counts;
}

export type ReferrerGroup = {
  referrerId: string;
  referrerName: string;
  /** 介绍人的账号（选填） */
  referrerChatId: string;
  /** 介绍了几个人（还没下单的也算） */
  refereeCount: number;
  /** 介绍的人都有谁，按姓名排 */
  refereeNames: string[];
  rows: RebateRow[];
  totalRebate: number;
  totalPaid: number;
  outstanding: number;
};

/**
 * 整个返点台账，一次算出来。
 *
 * **新建订单那一刻什么都不用做**：不写返点记录、不查介绍人、不遍历任何东西。
 * 返点只在打开这个页面时算一次 —— 一季 150~250 单，全在内存里 join，
 * 耗时是微秒级，真正花时间的是那几次 Supabase 往返（本来就要发）。
 *
 * 取消/未确认的单子不产生返点，但**行还留着**（rebate=0、counts=false）：
 * 万一那单已经付过返点，整行去掉就等于把已经花出去的钱从账上抹了。
 */
export function buildReferralBoard(input: {
  customers: ReferralCustomer[];
  orders: ReferralOrder[];
  payouts: ReferralPayout[];
  defaultRate?: number;
}): ReferrerGroup[] {
  const defaultRate = input.defaultRate ?? DEFAULT_REFERRAL_RATE;
  const byId = new Map(input.customers.map((r) => [r.id, r]));

  // referrer → 他介绍的人。反方向（谁介绍了我）是单列直接读，不用建索引
  const referees = new Map<string, ReferralCustomer[]>();
  for (const r of input.customers) {
    const by = r.referred_by;
    if (!by || by === r.id || !byId.has(by)) continue;
    const list = referees.get(by) ?? [];
    list.push(r);
    referees.set(by, list);
  }
  if (referees.size === 0) return [];

  const paidByKey = new Map<string, number>();
  for (const p of input.payouts) {
    const key = `${p.order_id}::${p.referrer_id}`;
    paidByKey.set(key, (paidByKey.get(key) ?? 0) + (toNum(p.amount) ?? 0));
  }

  const ordersByCustomer = new Map<string, ReferralOrder[]>();
  for (const o of input.orders) {
    const list = ordersByCustomer.get(o.customer_id) ?? [];
    list.push(o);
    ordersByCustomer.set(o.customer_id, list);
  }

  const groups: ReferrerGroup[] = [];
  for (const [referrerId, list] of referees) {
    const rows: RebateRow[] = [];
    for (const referee of list) {
      const rate = effectiveRate(referee, defaultRate);
      for (const o of ordersByCustomer.get(referee.id) ?? []) {
        const startDay = orderStartDay(o);
        // 顺序有意：单子本身黄了压过窗口 —— 一张取消的单说「窗口外」是误导
        const skipReason: SkipReason = !countsTowardRevenue(o.status)
          ? "status"
          : !withinReferralWindow(startDay, referee)
            ? "window"
            : null;
        const counts = skipReason === null;
        const amount = toNum(o.amount);
        const paid = paidByKey.get(`${o.id}::${referrerId}`) ?? 0;
        rows.push({
          orderId: o.id,
          referrerId,
          refereeId: referee.id,
          refereeName: customerName(referee),
          refereeChatId: referee.chat_id ?? "",
          location: o.location ?? "",
          startDay,
          days: o.demand_days ?? [],
          orderStatus: o.status ?? "",
          orderAmount: amount,
          rate,
          rebate: counts && amount !== null ? round2(amount * rate) : 0,
          counts,
          skipReason,
          paid: round2(paid),
          hasPayout: paid > 0,
        });
      }
    }

    // 新的单排前面；没有日期的（还没填需求日）沉底
    rows.sort((a, b) => (b.startDay ?? "").localeCompare(a.startDay ?? ""));

    const totalRebate = round2(rows.reduce((s, r) => s + r.rebate, 0));
    const totalPaid = round2(rows.reduce((s, r) => s + r.paid, 0));
    groups.push({
      referrerId,
      referrerName: customerName(byId.get(referrerId)),
      referrerChatId: byId.get(referrerId)?.chat_id ?? "",
      refereeCount: list.length,
      refereeNames: list.map(customerName).sort((a, b) => a.localeCompare(b)),
      rows,
      totalRebate,
      totalPaid,
      outstanding: round2(rows.reduce((s, r) => s + outstandingOf(r), 0)),
    });
  }

  // 还欠钱的排前面 —— 这一页最常回答的问题就是「现在该给谁打钱」
  groups.sort(
    (a, b) => b.outstanding - a.outstanding || a.referrerName.localeCompare(b.referrerName)
  );
  return groups;
}

/**
 * 顶上那几个数。
 * @param dueThrough 「本周待付」算到哪一天为止（本周日）。不传就不算这个数
 */
export function boardTotals(
  groups: ReferrerGroup[],
  dueThrough?: string
): {
  referrers: number;
  referees: number;
  totalRebate: number;
  totalPaid: number;
  outstanding: number;
  /** 到 dueThrough 为止该付的 —— 「现在该打多少钱出去」 */
  dueNow: number;
} {
  const rows = groups.flatMap((g) => g.rows);
  return {
    referrers: groups.length,
    referees: groups.reduce((s, g) => s + g.refereeCount, 0),
    totalRebate: round2(groups.reduce((s, g) => s + g.totalRebate, 0)),
    totalPaid: round2(groups.reduce((s, g) => s + g.totalPaid, 0)),
    outstanding: round2(groups.reduce((s, g) => s + g.outstanding, 0)),
    dueNow: dueThrough
      ? round2(
          rows.reduce((s, r) => s + (isDueBy(r, dueThrough) ? outstandingOf(r) : 0), 0)
        )
      : 0,
  };
}
