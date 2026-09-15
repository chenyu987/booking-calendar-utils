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

/**
 * 认不出来的状态照原样显示，不假装懂 —— 总比显示成「成了」强。
 *
 * `stale` 压过一切：库里还写着 `proposed`，但那一单已经开始了，跟物主说「等确认」
 * 就是在骗他 —— 他再等也等不到了。
 */
export function matchDisplay(status: string, stale = false): Display {
  if (stale && isOpenMatch(status)) {
    return {
      label: "没成",
      hint: "这一单已经开始了，没用上你的资源",
      color: "var(--text-faint)",
    };
  }
  return DISPLAY[status as MatchStatus] ?? { label: status, hint: "", color: "var(--text-muted)" };
}

/** 还在走流程的（物主还要等），跟已经有结果的分开显示 */
export function isOpenMatch(status: string): boolean {
  return status === "proposed" || status === "allowed";
}

/**
 * 这条意向**落空了没**：到了订单开始那天还没被选中，就再也用不上了。
 *
 * **为什么是「到那天」而不是「选中别人的那一刻」。** 中标的那条也可能退单 ——
 * 在行程开始之前，其余几条是**后备池**，随时能顶上去。选中一个就把兄弟清掉，
 * 等于把后备池砍了，退单时只能从头再找。所以它们一直留着，直到那天来了才落空。
 *
 * **为什么现算不存字段**（`matches.status` 库里仍然是 `proposed`）：
 * - 这是 CLAUDE.md 那条「能算出来的东西不要存成字段」。要存就得有个东西每天去扫，
 *   而这个项目没有任何定时任务基础设施 —— 为一个能一行算出来的结论建一套 cron 不划算
 * - 更要命的是**订单日期会变**（排期总览上拖一下就改了）。存成字段的话，
 *   把一个已经开始的单往后拖，那些意向还锁在「落空」上；而算出来的自己就跟着变了。
 *   这正是本项目栽过四次的那个模式
 *
 * 代价说清楚：直接查库的人看到的仍然是 `proposed`。要在 SQL 里统计「还活着的意向」，
 * 得把这条规则一起写进去。
 *
 * @param firstDay 这一单最早那天（`lib/matchSort.ts` 的 `firstDay`）。没填日期就判断不了，不落空
 */
export function isStaleMatch(status: string, firstDay: string, today: string): boolean {
  if (!isOpenMatch(status)) return false; // chosen / unfulfilled 已经有结果了
  if (!firstDay) return false;
  return firstDay <= today;
}
