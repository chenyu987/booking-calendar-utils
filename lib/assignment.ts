// 一个订单要几个资源、配了几张、还差几张
// 规则：一人一个资源，男的要男资源、女的要女资源（物品登记了使用人，性别对不上过不了核验）

export type Need = {
  maleNeeded: number;
  femaleNeeded: number;
  maleFilled: number;
  femaleFilled: number;
  maleGap: number;
  femaleGap: number;
  isComplete: boolean;
  isEmpty: boolean;
};

export function computeNeed(order: any, assignedResources: any[]): Need {
  const maleNeeded = order.male_count ?? 0;
  const femaleNeeded = order.female_count ?? 0;
  const maleFilled = assignedResources.filter(
    (s) => s?.holder_gender === "male"
  ).length;
  const femaleFilled = assignedResources.filter(
    (s) => s?.holder_gender === "female"
  ).length;

  const maleGap = Math.max(0, maleNeeded - maleFilled);
  const femaleGap = Math.max(0, femaleNeeded - femaleFilled);

  return {
    maleNeeded,
    femaleNeeded,
    maleFilled,
    femaleFilled,
    maleGap,
    femaleGap,
    isComplete: maleGap === 0 && femaleGap === 0,
    isEmpty: maleFilled + femaleFilled === 0,
  };
}

// 显示成「男1/1 女0/1」
export function formatNeed(n: Need): string {
  const parts: string[] = [];
  if (n.maleNeeded > 0) parts.push(`男${n.maleFilled}/${n.maleNeeded}`);
  if (n.femaleNeeded > 0) parts.push(`女${n.femaleFilled}/${n.femaleNeeded}`);
  return parts.join(" ") || "-";
}

// 还差什么，用于提示
export function formatGap(n: Need): string {
  const parts: string[] = [];
  if (n.maleGap > 0) parts.push(`${n.maleGap}张男资源`);
  if (n.femaleGap > 0) parts.push(`${n.femaleGap}张女资源`);
  return parts.length > 0 ? `还差 ${parts.join("、")}` : "已配齐";
}
