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

// 服务端和界面共用同一套日期冲突判断，避免只在按钮显示层拦截。
export function findConflictingDays(
  requestedDays: string[],
  bookedDays: string[]
): string[] {
  const booked = new Set(bookedDays);
  return [...new Set(requestedDays.filter((day) => booked.has(day)))].sort();
}

// 分配只自动维护 created/itemAssigned；已经进入取资源、付款等人工流程的状态不回退。
export function syncedAssignmentStatus(currentStatus: string, need: Need): string {
  if (currentStatus !== "created" && currentStatus !== "itemAssigned") {
    return currentStatus;
  }
  return need.isComplete ? "itemAssigned" : "created";
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

/**
 * 再配一个资源进这一单，合不合规矩。合规返回 null，不合规返回一句人话。
 *
 * 这两条以前只靠界面拦（配齐了就把「配这单」按钮藏掉），服务端没查过 ——
 * 拖拽分配一上来就把这个洞暴露了：拖过去照样能配，一个只要 1 张男资源的单
 * 能配上 2 张。CLAUDE.md 里那句「服务端必须校验，不能只靠界面藏按钮」
 * 说的就是这种事。
 *
 * 放在 lib 里而不是各写一份：分配有两条路径（排期总览的 addAssignment、
 * 匹配台把 match 改成 chosen），两边必须是同一套判断。
 */
export function extraAssignmentReason(
  order: { male_count?: number | null; female_count?: number | null },
  assignedResources: { id?: string; holder_gender?: string | null }[],
  candidate: { id?: string; holder_gender?: string | null; holder_name?: string | null }
): string | null {
  const name = candidate.holder_name ?? "这个资源";

  // 同一个资源不能配给同一单两次。库里有 unique(order_id, resource_id) 兜底，
  // 但那报出来是一串 Postgres 约束错误，看不懂，所以这里先给一句人话
  if (candidate.id && assignedResources.some((s) => s.id === candidate.id)) {
    return `${name} 已经配给这一单了`;
  }

  const need = computeNeed(order, assignedResources);
  if (candidate.holder_gender === "male" && need.maleGap === 0) {
    return `这一单只要 ${need.maleNeeded} 张男资源，已经配齐了`;
  }
  if (candidate.holder_gender === "female" && need.femaleGap === 0) {
    return `这一单只要 ${need.femaleNeeded} 张女资源，已经配齐了`;
  }
  return null;
}
