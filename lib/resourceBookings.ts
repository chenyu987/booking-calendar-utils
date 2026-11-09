// Resource 管理「排期」那一格点开的浮层：这个资源被哪些单子用过，一单一行。
//
// 原来每个资源的全部明细（连同客户名）都跟着页面一起渲染出来 —— 两百多个资源、近五千条分配，
// 页面 550KB、服务端画 2~6 秒，而浮层平时根本没人点开。现在页面上只留「第一单 … 最新一单 N 单」，
// 点开的时候才去 /admin/resources/bookings?id= 拿这一个资源的（app/admin/resources/BookingHistory.tsx）。
// 这里把订单排好序、格式化成一行行的字，浏览器那边只管摆。
import { bookingYear, summarizeBookings } from "./booking";
import { formatDayRanges } from "./dates";
import { displayName } from "./person";
import { STATUS_LABELS } from "./orderStatus";

export type BookingPopupRow = { id: string; days: string; year: string; location: string; customer: string; status: string };

export function bookingPopupRows(
  orders: { id: string; demand_days?: string[] | null; location?: string | null; status?: string | null; customers?: any }[]
): BookingPopupRow[] {
  return summarizeBookings(orders).list.map((o) => ({
    id: o.id,
    days: formatDayRanges(o.demand_days ?? []),
    year: bookingYear(o.demand_days),
    location: o.location ?? "?",
    customer: displayName(o.customers),
    status: (o.status && (STATUS_LABELS as Record<string, string>)[o.status]) ?? o.status ?? "",
  }));
}
