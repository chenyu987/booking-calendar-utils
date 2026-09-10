import { calcAge } from "@/lib/age";
import { normalizeLocation, itemFits, sameRegion, sameVenue } from "@/lib/locations";

// 推荐配哪个资源。
//
// **只负责排序，不负责放行。** 传进来的候选必须已经过了那三条硬校验
// （挂牌 active、有效期覆盖订单全部日期、同一天没被别的单占）——
// 推荐永远只是在「已经合法」的资源里挑一张更合适的，绝不放宽任何一条。
//
// 打分是加权求和，每条信号都会把自己的理由记下来，界面上鼠标一放就能看到
// 「为什么推荐它」。这一点是刻意的：分配这件事最后是人拍板，说不清理由的
// 推荐没人敢用。

export type Signal = { code: string; label: string; points: number };

export type Scored = {
  resourceId: string;
  score: number;
  signals: Signal[];
  /** 同性别候选里的最高分，且分数够高 —— 界面上打星星的就是它 */
  top: boolean;
};

export type PastUse = {
  resourceId: string;
  customerId: string | null;
  location: string | null;
  status: string;
  /** 这次用资源的日期，用来算「跟本单是不是连着的」 */
  days: string[];
};

export type Candidate = {
  id: string;
  itemType: string | null;
  holderDateOfBirth: string | null;
  providerId: string | null;
  /** 这个资源已经被排掉的日子（所有订单的并集） */
  bookedDays: string[];
};

export type RecommendInput = {
  order: { customerId: string | null; location: string | null; demandDays: string[] };
  /** 客户年龄。多数订单没有这个数据 —— 拿不到就传 null，年龄这条自动不参与 */
  customerAge: number | null;
  candidates: Candidate[];
  /** 这些资源过去被配给过哪些单 */
  history: PastUse[];
  /** 这一单已经配上的资源属于哪些物主 —— 同一个物主取还跑一趟就够 */
  assignedProviderIds?: string[];
};

// 权重。数值本身不重要，重要的是**相对大小**：
// 「这个客人用过这个资源」应该压过其它所有信号之和，因为核验照片对得上过是硬事实；
// 地理次之；年龄和运营便利只在前面打平时才起作用。
const W = {
  repeatCustomerSuccess: 50,
  repeatCustomerOther: 20,
  sameVenue: 30,
  sameRegion: 18,
  itemFits: 12,
  itemMismatch: -40,
  ageVeryClose: 12,
  ageClose: 6,
  ageFar: -6,
  adjacent: 8,
  sameProvider: 10,
};

// 「算数过的」订单状态：配上资源之后一路走下去的都算，取消和退款不算
const SETTLED = new Set(["itemAssigned", "pendingPickUp", "pendingPayment", "complete"]);

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 本单的日子跟这个资源已排的日子首尾相接吗 —— 接上就不会多切出一段碎片档期 */
function isAdjacent(demandDays: string[], booked: string[]): boolean {
  if (demandDays.length === 0 || booked.length === 0) return false;
  const bookedSet = new Set(booked);
  return demandDays.some(
    (d) => bookedSet.has(shiftDay(d, 1)) || bookedSet.has(shiftDay(d, -1))
  );
}

export function recommendResources(input: RecommendInput): Scored[] {
  const { order, customerAge, candidates, history, assignedProviderIds = [] } = input;

  // 订单没填地点、或者地点名库里认不出来 —— 整组不推荐。
  // 地理和类型是最主要的两个信号，两个都判断不了的时候硬推一张，比不推更危险；
  // 而且这样「改对了才能参与推荐分配」那句提示才是真的，改地点名有了直接回报。
  if (!normalizeLocation(order.location)) {
    return candidates.map((c) => ({ resourceId: c.id, score: 0, signals: [], top: false }));
  }
  const ownedAlready = new Set(assignedProviderIds.filter(Boolean) as string[]);

  const byResource = new Map<string, PastUse[]>();
  for (const h of history) {
    byResource.set(h.resourceId, [...(byResource.get(h.resourceId) ?? []), h]);
  }

  const scored: Scored[] = candidates.map((c) => {
    const signals: Signal[] = [];
    const past = byResource.get(c.id) ?? [];

    // 1. 这个客人以前就用过这个资源 —— 权重最高的信号。
    //    核验那关照片跟人对得上过，物主也认得这个人，复用的摩擦最小。
    if (order.customerId) {
      const mine = past.filter((p) => p.customerId === order.customerId);
      if (mine.some((p) => SETTLED.has(p.status))) {
        signals.push({
          code: "repeat-customer",
          label: "这个客人以前就用的这个资源",
          points: W.repeatCustomerSuccess,
        });
      } else if (mine.length > 0) {
        signals.push({
          code: "repeat-customer-unsettled",
          label: "这个客人配过这个资源（那单没走完）",
          points: W.repeatCustomerOther,
        });
      }
    }

    // 2. 地理惯性：这个资源以前就在这一片被用过。
    //    除了「理所应当」之外还有个实际好处 —— 同一个资源的使用地点前后一致，
    //    比一个资源这周在 RegionB、下周在 Vermont 要自然得多。
    const settledPast = past.filter((p) => SETTLED.has(p.status));
    const hitVenue = settledPast.find((p) => sameVenue(p.location, order.location));
    const hitRegion = settledPast.find((p) => sameRegion(p.location, order.location));
    if (hitVenue) {
      const r = normalizeLocation(order.location);
      signals.push({
        code: "same-venue",
        label: `这个资源去过 ${r?.canonical ?? order.location}`,
        points: W.sameVenue,
      });
    } else if (hitRegion) {
      const been = normalizeLocation(hitRegion.location);
      signals.push({
        code: "same-region",
        label: `同一片区域（这个资源去过 ${been?.canonical ?? hitRegion.location}）`,
        points: W.sameRegion,
      });
    }

    // 3. item 对不对得上。**这是提示不是拦截** —— 地点名是自由文本，
    //    认错了就不该把一张好资源按死，所以只重罚不封杀。
    const fits = itemFits(order.location, c.itemType);
    if (fits === true) {
      signals.push({ code: "item-fits", label: "类型对得上这个地点", points: W.itemFits });
    } else if (fits === false) {
      const r = normalizeLocation(order.location);
      signals.push({
        code: "item-mismatch",
        label: `${r?.canonical ?? order.location} 好像不收 ${c.itemType} 资源`,
        points: W.itemMismatch,
      });
    }

    // 4. 年龄。物品登记了使用人，年龄差太多核验时容易被拦。
    //    但**多数订单根本没记客户年龄**（只记了男女人数），所以这条经常是空转。
    const holderAge = calcAge(c.holderDateOfBirth);
    if (customerAge !== null && holderAge !== null) {
      const diff = Math.abs(holderAge - customerAge);
      if (diff <= 3) {
        signals.push({ code: "age", label: `年龄很接近（差 ${diff} 岁）`, points: W.ageVeryClose });
      } else if (diff <= 6) {
        signals.push({ code: "age", label: `年龄接近（差 ${diff} 岁）`, points: W.ageClose });
      } else if (diff > 12) {
        signals.push({ code: "age-far", label: `年龄差 ${diff} 岁，核验容易被拦`, points: W.ageFar });
      }
    }

    // 5. 跟这个资源已排的日子接上 —— 不会新切出一段用不掉的碎片档期
    if (isAdjacent(order.demandDays, c.bookedDays)) {
      signals.push({ code: "adjacent", label: "跟这个资源已排的日子连着", points: W.adjacent });
    }

    // 6. 这一单已经配了同一个物主的另一个资源 —— 取还资源跑一趟就够
    if (c.providerId && ownedAlready.has(c.providerId)) {
      signals.push({ code: "same-provider", label: "跟已配的资源是同一个物主", points: W.sameProvider });
    }

    return {
      resourceId: c.id,
      score: signals.reduce((sum, s) => sum + s.points, 0),
      signals,
      top: false,
    };
  });

  // 打星星的门槛：光「类型对得上」这种弱信号不足以叫推荐，
  // 至少要够到「同一片区域」那个量级，否则不如不推。
  const MIN_TOP = W.sameRegion;
  const best = Math.max(0, ...scored.map((s) => s.score));
  if (best >= MIN_TOP) {
    for (const s of scored) if (s.score === best) s.top = true;
  }
  return scored;
}

/** 界面上鼠标悬停时显示的整段理由 */
export function explain(s: Scored): string {
  if (s.signals.length === 0) return "没有特别的理由推荐或不推荐";
  return s.signals
    .map((x) => `${x.points > 0 ? "+" : ""}${x.points} ${x.label}`)
    .join("\n");
}
