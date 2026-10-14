// Customer 管理页「编辑」的表单校验。**唯一出处**：服务端（app/admin/customers/saveCustomer.ts）
// 靠它拦 —— 界面上的 required 只是提示，有人直接 POST 一样要拦；客户端点「保存」时也先跑
// 同一份，拦得住的错当场说，不用等后台存完再撤回。
//
// 不做删除：删一个 customer 会顺着外键 cascade 把他的订单、分配、付款一起删掉，
// 流水从账上凭空消失。不用了就把状态改成 inactive / blacklisted（provider 2026-10-03 定的）。

import { isIsoDate } from "./timelineStart";
import { calcAge } from "./age";

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
  // first_name / last_name 不经手：这两列现在是空的、留着备用（0022），后台编辑不写它们
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
      phone_number: orNull(clean(get("phone_number"))),
      email: orNull(email),
      date_of_birth: orNull(dob),
      status,
      note: orNull(clean(get("note"))),
    },
  };
}

/**
 * 存好之后这一行该显示成什么 —— 点「保存」那一下界面就先画成这样，不等服务端
 * （CustomerTable 后台存，存不上再撤回）。跟服务端渲染那一份同一套算法：年龄照样用
 * calcAge 从生日现算，不另写一份。
 */
export function customerRowAfterEdit(values: CustomerEdit, contactIds: string[]) {
  return {
    name: values.chat_name,
    chatId: values.chat_id ?? "",
    age: calcAge(values.date_of_birth),
    status: values.status,
    note: values.note ?? "",
    contactIds,
    // 下次再点「编辑」时表单的初始值：跟服务端给的一个形状（空串，不是 null）
    edit: {
      chat_name: values.chat_name,
      chat_id: values.chat_id ?? "",
      phone_number: values.phone_number ?? "",
      email: values.email ?? "",
      date_of_birth: values.date_of_birth ?? "",
      status: values.status,
      note: values.note ?? "",
    },
  };
}
