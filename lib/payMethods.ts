// 收付款方式的**唯一出处**。库里 payments.method 和 referral_payouts.method
// 两处 check 约束列的是同一批值，界面上的下拉也得跟它们一致 ——
// 原来这个数组只写在 /admin/payments 里，返点那边一用就成了第二份。
export const PAY_METHODS = [
  "zelle",
  "venmo",
  "cash",
  "zhifubao",
  "chat",
  "payid",
  "emt",
] as const;

export type PayMethod = (typeof PAY_METHODS)[number];

/** 界面传上来的值不一定干净，不认识的一律当「没填」，别硬塞进去让库的 check 报错 */
export function parsePayMethod(value: unknown): PayMethod | null {
  const v = typeof value === "string" ? value.trim() : "";
  return (PAY_METHODS as readonly string[]).includes(v) ? (v as PayMethod) : null;
}
