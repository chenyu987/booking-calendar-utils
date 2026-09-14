// 匹配意向的状态，说给**物主**听。
//
// 库里存的是 proposed / allowed / chosen / unfulfilled，管理员那边直接看这几个
// 英文词就够了（他知道流程）。物主不知道，所以这里翻成「他关心的那件事」——
// 他关心的不是流程走到哪一格，而是**我这单到底成没成、还要不要等**。
//
// 为什么单独一份：物主提完意向之后原来没有任何地方看得到后来怎么样了，
// 提了就石沉大海。这几个词是补上那个缺口的全部内容，散着写迟早对不上。

export const MATCH_STATUSES = ["proposed", "allowed", "chosen", "unfulfilled"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

type Display = { label: string; hint: string; color: string };

const DISPLAY: Record<MatchStatus, Display> = {
  proposed: {
    label: "等确认",
    hint: "管理员还没看，等着就行",
    color: "var(--st-pickup-text)",
  },
  allowed: {
    label: "已放行",
    hint: "管理员放行了，等客户那边定下来",
    color: "var(--link)",
  },
  chosen: {
    label: "成了",
    hint: "这个资源已经配给这一单了",
    color: "var(--ok)",
  },
  unfulfilled: {
    label: "没成",
    hint: "这一单没用上你的资源",
    color: "var(--text-faint)",
  },
};

/** 认不出来的状态照原样显示，不假装懂 —— 总比显示成「成了」强 */
export function matchDisplay(status: string): Display {
  return DISPLAY[status as MatchStatus] ?? { label: status, hint: "", color: "var(--text-muted)" };
}

/** 还在走流程的（物主还要等），跟已经有结果的分开显示 */
export function isOpenMatch(status: string): boolean {
  return status === "proposed" || status === "allowed";
}
