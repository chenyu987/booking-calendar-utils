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

/** 一段的完整文字，给 tooltip 和窄处截断用 */
export function formatRun(r: BookingRun): string {
  return r.location ? `${r.label} ${r.location}` : `${r.label} 地点没填`;
}
