// 「少几个人」：客人说原来四个人、现在只来两个。一步做完三件事 ——
// 人数减掉、总价按比例减（每人每天的价钱不变，lib/pricing.ts 的 rescaleAmount）、
// 配给这几个人的资源退回去（删掉那几条分配，那几天自然空出来）。
//
// 一次可以勾好几个人（2026-11-17 用户要的：一次少两三个人是常事）。
// 纯逻辑放这里，服务端（app/admin/overview/drop-person）和浮动条菜单共用一份：
// 菜单列哪几项、服务端认不认，是同一个判断。

export type Gender = "male" | "female";
export type DropCard = { id: string; label: string; gender: string | null };

/**
 * 菜单上的一个人：配了资源的是「Evan 那个资源的那个人」，没分配的是「一个还没分配的男的」。
 * key 在一单里唯一（没分配的同性别可能有好几个，靠序号分开）
 */
export type DropOption = { key: string; gender: Gender; resourceId: string | null; label: string };

const GENDER_LABEL: Record<Gender, string> = { male: "男", female: "女" };

export function dropPersonOptions(male: number, female: number, cards: DropCard[]): DropOption[] {
  // 只剩一个人就没有「少一个」了 —— 那是删单
  if (male + female <= 1) return [];
  const out: DropOption[] = [];
  for (const gender of ["male", "female"] as Gender[]) {
    const count = gender === "male" ? male : female;
    if (count <= 0) continue;
    const g = GENDER_LABEL[gender];
    const mine = cards.filter((c) => c.gender === gender);
    for (const c of mine) {
      out.push({ key: `card:${c.id}`, gender, resourceId: c.id, label: `${g} · ${c.label} 的资源（退回去）` });
    }
    const unassigned = Math.max(0, count - mine.length);
    for (let i = 0; i < unassigned; i++) {
      out.push({ key: `${gender}:${i}`, gender, resourceId: null, label: `${g} · 还没分配的` });
    }
  }
  return out;
}

export type DropPlan =
  | { error: string }
  | { male: number; female: number; removeResourceIds: string[] };

/**
 * 服务端用：这一下能不能做、做完人数是多少、退哪几个资源。不合规返回人话。
 * drops 是一串 { gender, resource_id }，一项一个人；resource_id 空 = 少的是还没分配的那个
 */
export function planDropPerson(
  order: { male_count: number | null; female_count: number | null },
  cards: { id: string; holder_gender: string | null }[],
  drops: unknown
): DropPlan {
  if (!Array.isArray(drops) || drops.length === 0) return { error: "没选要少哪几个人" };
  const male = order.male_count ?? 0;
  const female = order.female_count ?? 0;
  const counts: Record<Gender, number> = { male, female };
  const dropped: Record<Gender, number> = { male: 0, female: 0 };
  const unassignedDropped: Record<Gender, number> = { male: 0, female: 0 };
  const removeResourceIds: string[] = [];

  for (const d of drops) {
    const gender: unknown = (d as any)?.gender;
    const resourceId: unknown = (d as any)?.resource_id;
    if (gender !== "male" && gender !== "female") return { error: "gender 只能是 male / female" };
    dropped[gender]++;
    if (resourceId == null || resourceId === "") {
      unassignedDropped[gender]++;
      continue;
    }
    if (typeof resourceId !== "string") return { error: "resource_id 不对" };
    if (removeResourceIds.includes(resourceId)) return { error: "同一个资源选了两次" };
    if (!cards.some((c) => c.id === resourceId && c.holder_gender === gender)) {
      return { error: `这个资源没配在这一单的${GENDER_LABEL[gender]}客人上` };
    }
    removeResourceIds.push(resourceId);
  }

  for (const g of ["male", "female"] as Gender[]) {
    if (dropped[g] > counts[g]) return { error: `这一单只有 ${counts[g]} 个${GENDER_LABEL[g]}的，少不了 ${dropped[g]} 个` };
    // 说「少一个还没分配的」，可这个性别没分配的人没那么多 —— 留下的人会比资源少，多半是界面数据过时了，不猜
    const cardsOfG = cards.filter((c) => c.holder_gender === g).length;
    if (unassignedDropped[g] > Math.max(0, counts[g] - cardsOfG)) {
      return { error: `${GENDER_LABEL[g]}的没分配的没有 ${unassignedDropped[g]} 个 —— 刷新一下再试` };
    }
  }
  if (male + female - drops.length < 1) return { error: "不能一个人都不剩 —— 不要了就删单" };

  return { male: male - dropped.male, female: female - dropped.female, removeResourceIds };
}
