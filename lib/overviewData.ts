import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { seasonDays, type Season } from "@/lib/season";

// 排期总览查库的那几条，**整季拉（page.tsx）和只拉变了的几行（rows/route.ts）共用这一份**：
// 字段少写一个，实时合进来的那几行就跟整季拉的长得不一样，色块上悄悄少一样东西。

/**
 * 订单 + 客人 + 配了哪几个资源。
 * customer_id / 生日是推荐分配要用的；分配跟着订单一起带回来，不单独拉整张 order_assignments
 */
export const ORDER_SELECT = `id, customer_id, admin_id, location, amount, status, demand_days, male_count, female_count, customers(${personSpread(
  "chat_name, chat_id, first_name, last_name, date_of_birth"
)}), order_assignments(resource_id)`;

/** provider_id 是推荐要用的：同一单的两个资源如果同一个物主，取还跑一趟就够 */
export const RESOURCE_SELECT =
  "id, provider_id, holder_name, holder_gender, holder_date_of_birth, holder_photo_path, item_type, validity, status";

/** 这一季的单：有一天落在这一季里就算（lib/season.ts）。跨季的单两边都看得见 */
export function seasonOrdersQuery(season: Season) {
  return supabase.from("orders").select(ORDER_SELECT).overlaps("demand_days", seasonDays(season));
}

/**
 * 物主删掉的资源不在这儿列 —— 这一页是干活的地方，配也配不上（lib/assignable.ts 拦着）。
 * 库里还在，要看去 /admin/resources（迁移 0013）
 */
export function resourcesQuery() {
  return supabase.from("resources").select(RESOURCE_SELECT).is("deleted_at", null);
}
