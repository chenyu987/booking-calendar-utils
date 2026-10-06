// Customer 管理页「编辑」的表单校验。**服务端唯一出处**：界面上的 required 只是提示，
// 有人直接 POST 一样要拦。
//
// 不做删除：删一个 customer 会顺着外键 cascade 把他的订单、分配、付款一起删掉，
// 流水从账上凭空消失。不用了就把状态改成 inactive / blacklisted（provider 2026-10-03 定的）。

import { isIsoDate } from "./timelineStart";

export const CUSTOMER_STATUSES = ["active", "inactive", "blacklisted"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "正常",
  inactive: "停用",
  blacklisted: "黑名单",
};

export type CustomerEdit = {
  /** 昵称：必填，后台认人、显示都靠它（0020） */
  chat_name: string;
  /** 账号：选填 */
  chat_id: string | null;
  /** 注册用户自己填的称呼：选填（0020 起后台不拿它显示） */
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  email: string | null;
  date_of_birth: string | null;
  status: CustomerStatus;
  note: string | null;
};

const clean = (v: string | null | undefined) => (v ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);

/**
 * 表单 → 要写进库的值，或者一句为什么不行。
 * @param get 按字段名取值（FormData.get 包一层就行，也方便测试）
 * @param today 今天（ISO），生日不能在今天之后
 */
export function parseCustomerEdit(
  get: (field: string) => string | null | undefined,
  today: string
): { values: CustomerEdit } | { error: string } {
  const chat_name = clean(get("chat_name"));
  // 昵称必填：认人的主要依据（排期总览上显示的、返点按它找人的都是它）。
  // 称呼（first_name）不再必填 —— 那是留给以后注册用户自己填的（0020）
  if (!chat_name) return { error: "昵称必填" };

  const status = clean(get("status")) as CustomerStatus;
  if (!CUSTOMER_STATUSES.includes(status)) return { error: `状态只能是：${CUSTOMER_STATUSES.join(" / ")}` };

  const dob = clean(get("date_of_birth"));
  if (dob && !isIsoDate(dob)) return { error: "生日格式不对" };
  if (dob && dob > today) return { error: "生日不能晚于今天" };

  const email = clean(get("email")).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "邮箱格式不对" };

  return {
    values: {
      chat_name,
      chat_id: orNull(clean(get("chat_id"))),
      first_name: orNull(clean(get("first_name"))),
      last_name: orNull(clean(get("last_name"))),
      phone_number: orNull(clean(get("phone_number"))),
      email: orNull(email),
      date_of_birth: orNull(dob),
      status,
      note: orNull(clean(get("note"))),
    },
  };
}
