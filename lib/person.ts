// 「这个人是谁、怎么找他」显示成一句话。
//
// 匹配台上同一行里 Provider 和客户是并排的，写法必须一致 —— 一边是「Zoey Lee (zqwer5578)」
// 另一边只有个「小明」，看着像客户那边信息缺了一半，其实只是没取。
//
// **只在 admin 侧用。** 客户的联系方式不能出现在物主那边，物主的也不能出现在客户那边
// （CLAUDE.md：那是双方的隐私，也是平台作为中间人的价值）—— 那两边根本不查这些字段。
export function formatPerson(
  first?: string | null,
  last?: string | null,
  chat?: string | null
): string {
  const name = [first, last].filter(Boolean).join(" ").trim();
  if (!name) return chat ? `? (${chat})` : "-";
  return chat ? `${name} (${chat})` : name;
}
