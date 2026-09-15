import { isWeekend, shortLabel } from "@/lib/dates";
import { PROVIDER_COL_GAP, PROVIDER_COL_WIDTH } from "@/lib/providerBoard";

/**
 * 日历上那条日期行 —— 匹配台和物主两张日历共用这一份。
 *
 * **周末的橙底和「今天」那条粗线只画在日期格上，不往下带。** 整列贯通的竖条在
 * 排期总览那边是留给 peak date 的（限制资源那几天进不了场，比「今天周几」要紧得多）；
 * 拿它去画周末，泳道里就多出几条跟订单无关的柱子，比色块本身还显眼。
 *
 * 两张日历各写一份的时候，改完一边忘了另一边 —— 第二份样式和第二份数字是同一个 bug。
 */
export const BOARD_HEADER_H = 36;

export default function BoardDayHeader({
  days,
  today,
  columns,
}: {
  days: string[];
  today: string;
  /**
   * 列怎么分。外面那张 grid 传什么，这排日期就用什么 —— **同一份模板**，
   * 不然日期跟底下的块差个一两像素，看着就毛躁了。
   * 不传就按自己这几天铺（列宽弹性，最窄 56px）。
   */
  columns?: string;
}) {
  const template =
    columns ?? `repeat(${days.length}, minmax(${PROVIDER_COL_WIDTH}px, 1fr))`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: template,
        gap: PROVIDER_COL_GAP,
        height: BOARD_HEADER_H,
      }}
    >
      {days.map((d) => {
        const { date, weekday } = shortLabel(d);
        const weekend = isWeekend(d);
        return (
          <div
            key={d}
            data-today={d === today ? "1" : undefined}
            style={{
              boxSizing: "border-box",
              textAlign: "center",
              fontSize: 11,
              paddingTop: 4,
              background: weekend ? "var(--weekend-bg)" : "var(--surface-2)",
              borderBottom: d === today ? "2px solid var(--text)" : "1px solid var(--border)",
              color: weekend ? "var(--warn)" : "var(--text-muted)",
              fontWeight: d === today ? 600 : 400,
            }}
          >
            <div>{date}</div>
            <div style={{ fontSize: 10 }}>{weekday}</div>
          </div>
        );
      })}
    </div>
  );
}
