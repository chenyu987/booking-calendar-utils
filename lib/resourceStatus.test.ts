import { describe, it, expect } from "vitest";
import {
  coversOrder,
  isExpired,
  statusBadge,
  abnormalBadge,
  itemConflictReason,
} from "./resourceStatus";

describe("coversOrder", () => {
  const resource = { date_range_start: "2026-07-30", date_range_end: "2026-09-20" };

  it("订单日期全在有效期内就算覆盖", () => {
    expect(coversOrder(resource, ["2026-09-10", "2026-09-12"])).toBe(true);
  });

  it("订单有一天超出有效期就不覆盖", () => {
    expect(coversOrder(resource, ["2026-09-10", "2026-09-25"])).toBe(false);
  });

  it("过期的资源配历史订单（订单日期在过期前）是合法的", () => {
    // 关键：判断依据是订单那几天资源有没有效，不是今天资源过没过期
    const expiredCard = { date_range_start: "2026-06-01", date_range_end: "2026-07-01" };
    expect(coversOrder(expiredCard, ["2026-06-15"])).toBe(true);
  });

  it("没有需求日期不算覆盖", () => {
    expect(coversOrder(resource, [])).toBe(false);
  });
});

describe("isExpired", () => {
  it("有效期早于今天算过期", () => {
    expect(isExpired({ date_range_end: "2000-01-01" })).toBe(true);
  });

  it("有效期晚于今天不算过期", () => {
    expect(isExpired({ date_range_end: "2999-01-01" })).toBe(false);
  });

  it("没有有效期不算过期", () => {
    expect(isExpired({})).toBe(false);
  });
});

describe("statusBadge / abnormalBadge", () => {
  it("挂牌已下架时显示已下架", () => {
    expect(statusBadge({ status: "archived" }).text).toBe("已下架");
  });

  it("挂牌暂停时显示暂停", () => {
    expect(statusBadge({ status: "paused" }).text).toBe("暂停");
  });

  it("正常出租中的资源没有 abnormalBadge", () => {
    const resource = { status: "active", date_range_end: "2999-01-01" };
    expect(abnormalBadge(resource)).toBeNull();
  });

  it("过期的资源有 abnormalBadge", () => {
    const resource = { status: "active", date_range_end: "2000-01-01" };
    expect(abnormalBadge(resource)?.text).toBe("已过期");
  });
});

describe("itemConflictReason（第四条校验：类型要能进这个地点）", () => {
  const alphaCard = { item_type: "alpha", holder_name: "A" };
  const betaCard = { item_type: "beta", holder_name: "B" };

  it("alpha 资源配 Alpha 的地点 → 放行", () => {
    expect(itemConflictReason(alphaCard, "locbg")).toBeNull();
    expect(itemConflictReason(alphaCard, "locbe")).toBeNull();
  });

  it("beta 资源配 Alpha 的地点 → 拦住，并说清楚为什么", () => {
    const reason = itemConflictReason(betaCard, "locbh");
    expect(reason).toContain("locbh");
    expect(reason).toContain("alpha");
    expect(reason).toContain("beta");
    expect(reason).toContain("B");
  });

  it("地点名判断不了就不拦 —— 漏拦好过错拦", () => {
    expect(itemConflictReason(betaCard, null)).toBeNull();      // 没填地点
    expect(itemConflictReason(betaCard, "")).toBeNull();
    expect(itemConflictReason(betaCard, "111")).toBeNull();      // 库里没有
    expect(itemConflictReason(betaCard, "hiddenvalley")).toBeNull(); // 有歧义
  });

  it("类型没填也不拦", () => {
    expect(itemConflictReason({ item_type: null, holder_name: "C" }, "locbg")).toBeNull();
  });
});
