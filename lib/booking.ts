import { contiguousRuns, formatDayRanges } from "@/lib/dates";

// 资源清单上那行「已排 …」。原来只显示日期，看不出去的是哪个地点 ——
// 而分配时最想知道的恰恰是「这个资源最近在哪一片用」。

export type Booking = { days: string[]; location: string | null };

export type BookingRun = {
  start: string;
  end: string;
  /** 紧凑显示，比如「9/12~9/13」 */
  label: string;
  location: string | null;
  /** 已经过去了 —— 界面上淡一点，把注意力留给还没到的 */
  past: boolean;
};

/**
 * 把每个订单的日期拆成连续段，每段带上那一单去的地点。
 *
 * 为什么按订单拆而不是把所有日期并成一堆：并起来就丢了「哪几天是去哪个地点」，
 * 而这正是要显示的东西。同一单里不连续的日子（只用 24、25、27）还是各算一段。
 */
export function toBookingRuns(bookings: Booking[], today: string): BookingRun[] {
  const runs: BookingRun[] = [];
  for (const b of bookings) {
    const days = [...(b.days ?? [])].sort();
    for (const run of contiguousRuns(days)) {
      if (run.length === 0) continue;
      const end = run[run.length - 1];
      runs.push({
        start: run[0],
        end,
        label: formatDayRanges(run),
        location: b.location?.trim() || null,
        past: end < today,
      });
    }
  }
  return runs;
}

/**
 * 按时间正序（早 → 晚），时间轴该往哪走就往哪走。
 *
 * 「最近一次优先看到」不是靠倒排实现的，而是靠**默认把这一行滚到最右边**
 * （见 CardsRowScroll）：顺序保持直觉，视窗停在最有用的那一头，
 * 早期的踪迹被推到左边，想看就往左滑。
 *
 * 倒排试过，被否了：读起来别扭，而且「最近」和「最早」混在一起时
 * 要在脑子里把时间轴翻过来。
 */
export function sortChronologically(runs: BookingRun[]): BookingRun[] {
  return [...runs].sort((a, b) => {
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.end < b.end ? -1 : 1;
  });
}

/**
 * Resource 管理页「排期」那一列：一眼只给**第一单**和**最新一单**，其余收进浮层。
 *
 * 原来是所有单子挤在一行里横着滚，那一列只分到一百多像素，连一单都放不全，
 * 实际上只看得到第一条。这一列要回答的是「这个资源去过哪、最近去哪」，
 * 头尾两条就够了；客户名、状态、中间那几单点开再看。
 *
 * 「最新」按**活动日期**算，不按下单时间 —— 补录的历史单下单晚、日子早，
 * 按下单时间排会把它当成「最新」。
 *
 * 连接符：中间真省掉了单子才用「…」；只有两单时中间什么都没省，写成「、」，
 * 不然「…」会让人以为中间还有。
 */
export function summarizeBookings<T extends { demand_days?: string[] | null }>(
  orders: T[]
): { list: T[]; first: T | null; last: T | null; joiner: "…" | "、" | null } {
  const span = (o: T) => {
    const days = [...(o.demand_days ?? [])].sort();
    return { start: days[0] ?? "", end: days[days.length - 1] ?? "" };
  };
  const list = [...orders].sort((a, b) => {
    const x = span(a);
    const y = span(b);
    if (x.start !== y.start) return x.start < y.start ? -1 : 1;
    return x.end < y.end ? -1 : x.end > y.end ? 1 : 0;
  });
  const n = list.length;
  return {
    list,
    first: list[0] ?? null,
    last: n > 1 ? list[n - 1] : null,
    joiner: n >= 3 ? "…" : n === 2 ? "、" : null,
  };
}

/** 一段的完整文字，给 tooltip 和窄处截断用 */
export function formatRun(r: BookingRun): string {
  return r.location ? `${r.label} ${r.location}` : `${r.label} 地点没填`;
}
