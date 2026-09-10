import { describe, it, expect } from "vitest";
import { computeNeed, findConflictingDays, formatNeed, formatGap, syncedAssignmentStatus, extraAssignmentReason } from "./assignment";

describe("computeNeed", () => {
  it("1男1女订单，两个资源都配了就算配齐", () => {
    const order = { male_count: 1, female_count: 1 };
    const need = computeNeed(order, [
      { holder_gender: "male" },
      { holder_gender: "female" },
    ]);
    expect(need.isComplete).toBe(true);
    expect(need.maleGap).toBe(0);
    expect(need.femaleGap).toBe(0);
  });

  it("配一半不算配齐", () => {
    const order = { male_count: 1, female_count: 1 };
    const need = computeNeed(order, [{ holder_gender: "male" }]);
    expect(need.isComplete).toBe(false);
    expect(need.femaleGap).toBe(1);
  });

  it("没配任何资源是 isEmpty", () => {
    const order = { male_count: 1, female_count: 0 };
    const need = computeNeed(order, []);
    expect(need.isEmpty).toBe(true);
    expect(need.isComplete).toBe(false);
  });

  it("male_count/female_count 缺省当 0", () => {
    const need = computeNeed({}, []);
    expect(need.maleNeeded).toBe(0);
    expect(need.femaleNeeded).toBe(0);
    expect(need.isComplete).toBe(true); // 什么都不需要，自然配齐
  });
});

describe("formatNeed", () => {
  it("男女都要显示两段", () => {
    const need = computeNeed({ male_count: 1, female_count: 1 }, [
      { holder_gender: "male" },
    ]);
    expect(formatNeed(need)).toBe("男1/1 女0/1");
  });

  it("只要男的只显示男", () => {
    const need = computeNeed({ male_count: 2, female_count: 0 }, []);
    expect(formatNeed(need)).toBe("男0/2");
  });
});

describe("formatGap", () => {
  it("配齐了显示已配齐", () => {
    const need = computeNeed({ male_count: 1, female_count: 0 }, [
      { holder_gender: "male" },
    ]);
    expect(formatGap(need)).toBe("已配齐");
  });

  it("还差男女各一张", () => {
    const need = computeNeed({ male_count: 1, female_count: 1 }, []);
    expect(formatGap(need)).toBe("还差 1张男资源、1张女资源");
  });
});

describe("findConflictingDays", () => {
  it("返回订单日期和卡片已占日期的交集，并去重排序", () => {
    expect(
      findConflictingDays(
        ["2026-09-12", "2026-09-10", "2026-09-12"],
        ["2026-09-11", "2026-09-12", "2026-09-12"]
      )
    ).toEqual(["2026-09-12"]);
  });

  it("没有重叠日期时返回空数组", () => {
    expect(
      findConflictingDays(["2026-09-10"], ["2026-09-11"])
    ).toEqual([]);
  });
});

describe("syncedAssignmentStatus", () => {
  it("配齐后把 created 推进到 itemAssigned", () => {
    const need = computeNeed({ male_count: 1, female_count: 0 }, [
      { holder_gender: "male" },
    ]);
    expect(syncedAssignmentStatus("created", need)).toBe("itemAssigned");
  });

  it("不再配齐时把 itemAssigned 回退到 created", () => {
    const need = computeNeed({ male_count: 1, female_count: 0 }, []);
    expect(syncedAssignmentStatus("itemAssigned", need)).toBe("created");
  });

  it("人工推进的后续状态不被分配重算覆盖", () => {
    const need = computeNeed({ male_count: 1, female_count: 0 }, []);
    expect(syncedAssignmentStatus("pendingPayment", need)).toBe(
      "pendingPayment"
    );
  });
});

describe("extraAssignmentReason（配多了 / 配重了）", () => {
  const male = (id: string) => ({ id, holder_gender: "male", holder_name: id });
  const female = (id: string) => ({ id, holder_gender: "female", holder_name: id });
  const order = { male_count: 1, female_count: 1 };

  it("还差就放行", () => {
    expect(extraAssignmentReason(order, [], male("a"))).toBeNull();
    expect(extraAssignmentReason(order, [male("a")], female("b"))).toBeNull();
  });

  it("这个性别配齐了就拦住，并说清楚要几张", () => {
    const reason = extraAssignmentReason(order, [male("a")], male("b"));
    expect(reason).toContain("只要 1 张男资源");
    expect(reason).toContain("配齐");
  });

  it("男资源配齐了不影响女资源", () => {
    expect(extraAssignmentReason(order, [male("a")], female("b"))).toBeNull();
  });

  it("同一个资源不能配给同一单两次", () => {
    const reason = extraAssignmentReason(order, [male("a")], male("a"));
    expect(reason).toContain("已经配给这一单了");
  });

  it("重复优先于「配齐了」—— 说「已经配过」比说「配齐了」更贴近实际发生的事", () => {
    const o = { male_count: 1, female_count: 0 };
    expect(extraAssignmentReason(o, [male("a")], male("a"))).toContain("已经配给这一单");
  });

  it("2男的单可以配两张男资源，第三张才拦", () => {
    const o = { male_count: 2, female_count: 0 };
    expect(extraAssignmentReason(o, [male("a")], male("b"))).toBeNull();
    expect(extraAssignmentReason(o, [male("a"), male("b")], male("c"))).toContain("只要 2 张男资源");
  });

  it("性别没填的资源不按性别拦（那是另一个问题）", () => {
    const o = { male_count: 1, female_count: 0 };
    expect(extraAssignmentReason(o, [male("a")], { id: "x", holder_gender: null })).toBeNull();
  });
});
