
export const REQUEST_STATUSES = ["new", "contacted", "won", "ignored"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: "新的",
  contacted: "已联系",
  won: "成交",
  ignored: "不跟",
};

/** 表单 / URL 里来的状态。认不出来的给 null，不猜 —— 跟库里的 check 是同一份名单 */
export function parseRequestStatus(raw: unknown): RequestStatus | null {
  return REQUEST_STATUSES.includes(raw as RequestStatus) ? (raw as RequestStatus) : null;
}

/** 管理员备注的上限。写多了是贴错了东西，不是真要记这么多 */
export const REQUEST_NOTE_MAX = 500;

export type RequestPerson = { id: string; chat_name?: string | null; chat_id?: string | null };

// **精确匹配**（2026-10-24 用户定的）：只去掉两头的空白，中间的空格、大小写都算数。
// 页面也是拿这一页的名字去库里 `.in(...)` 精确查的，两边口径一致。
const norm = (v?: string | null) => (v ?? "").trim();

/**
 * 发言人对得上哪个老客户 —— **现算不存**（0029 顶上说了为什么）。
 *
 * 跟 referral.ts 的 resolveCustomer 同一个口径：先比昵称，再比账号，哪一档对上了就只看那一档；
 * **对上多个就当没对上**。猜错一个人，运营会拿着别人的历史单子去聊，比不提示还糟。
 *
 * 只是提示：群里显示的可能是群昵称，不是昵称，对不上不代表是新客人。
 */
export function matchRequestPerson<P extends RequestPerson>(sender: string, people: P[]): P | null {
  const q = norm(sender);
  if (!q) return null;
  for (const field of ["chat_name", "chat_id"] as const) {
    const hits = people.filter((p) => norm(p[field]) === q);
    if (hits.length) return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

/** "03-14","03-15" → "3/14、3/15"。年份模型不知道（0029），所以不显示 */
export function formatRequestDates(dates?: string[] | null): string {
  return (dates ?? [])
    .map((d) => {
      const m = /^(\d{1,2})-(\d{1,2})$/.exec(d);
      return m ? `${Number(m[1])}/${Number(m[2])}` : d;
    })
    .join("、");
}

/** 男女人数。物品登记了使用人，性别是硬条件，所以分开写 */
export function formatRequestParty(male?: number | null, female?: number | null): string {
  const parts = [male ? `男${male}` : "", female ? `女${female}` : ""].filter(Boolean);
  return parts.join(" ") || "—";
}
