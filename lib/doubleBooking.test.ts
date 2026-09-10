import { describe, it, expect } from "vitest";
import {
  overlappingDays,
  findClashes,
  indexClashes,
  clashKey,
  resizeConflictReason,
  type Booking,
} from "./doubleBooking";

const uses = (m: Record<string, Booking[]>) => new Map(Object.entries(m));

describe("overlappingDays", () => {
  it("交集，排序去重", () => {
    expect(overlappingDays(["2026-01-02", "2026-01-01"], ["2026-01-01", "2026-01-03"])).toEqual([
      "2026-01-01",
    ]);
  });
  it("不重叠就是空", () => {
    expect(overlappingDays(["2026-01-01"], ["2026-01-02"])).toEqual([]);
  });
});

describe("findClashes", () => {
  it("同一个资源同一天配给两单 → 两边都报", () => {
    const out = findClashes(
      uses({
        s1: [
          { orderId: "A", days: ["2026-01-01", "2026-01-02"] },
          { orderId: "B", days: ["2026-01-02", "2026-01-03"] },
        ],
      })
    );
    expect(out).toHaveLength(2);
    // 界面上 A 和 B 两个色块都要标红，所以两边都得查得到
    expect(out.map((c) => c.orderId).sort()).toEqual(["A", "B"]);
    expect(out[0].days).toEqual(["2026-01-02"]);
  });

  it("错开的日子不算冲突", () => {
    const out = findClashes(
      uses({
        s1: [
          { orderId: "A", days: ["2026-01-01"] },
          { orderId: "B", days: ["2026-01-02"] },
        ],
      })
    );
    expect(out).toEqual([]);
  });

  it("**同一个订单**的多条记录不算自己跟自己撞", () => {
    const out = findClashes(
      uses({ s1: [{ orderId: "A", days: ["2026-01-01"] }, { orderId: "A", days: ["2026-01-01"] }] })
    );
    expect(out).toEqual([]);
  });

  it("不同的资源各算各的，互不牵连", () => {
    const out = findClashes(
      uses({
        s1: [{ orderId: "A", days: ["2026-01-01"] }],
        s2: [{ orderId: "B", days: ["2026-01-01"] }],
      })
    );
    expect(out).toEqual([]);
  });

  it("三个单子撞同一个资源：两两都报", () => {
    const out = findClashes(
      uses({
        s1: [
          { orderId: "A", days: ["2026-01-01"] },
          { orderId: "B", days: ["2026-01-01"] },
          { orderId: "C", days: ["2026-01-01"] },
        ],
      })
    );
    // A-B, A-C, B-C 三对，每对两条
    expect(out).toHaveLength(6);
  });
});

describe("indexClashes", () => {
  it("按订单+资源查得到", () => {
    const idx = indexClashes(
      findClashes(
        uses({
          s1: [
            { orderId: "A", days: ["2026-01-02"] },
            { orderId: "B", days: ["2026-01-02"] },
          ],
        })
      )
    );
    expect(idx.get(clashKey("A", "s1"))?.[0].otherOrderId).toBe("B");
    expect(idx.get(clashKey("B", "s1"))?.[0].otherOrderId).toBe("A");
    expect(idx.get(clashKey("A", "s2"))).toBeUndefined();
  });
});

describe("resizeConflictReason：拖日期之前拦一道", () => {
  const assigned = [{ resourceId: "s1", holderName: "sara lee" }];

  it("新日期撞上这个资源在别单的日子 → 拦住，并说清是哪个资源哪一天", () => {
    const reason = resizeConflictReason(
      ["2026-01-01", "2026-01-02"],
      assigned,
      uses({ s1: [{ orderId: "B", days: ["2026-01-02"] }] })
    );
    expect(reason).toContain("sara lee");
    expect(reason).toContain("2026-01-02");
  });

  it("不撞就放行", () => {
    expect(
      resizeConflictReason(
        ["2026-01-01"],
        assigned,
        uses({ s1: [{ orderId: "B", days: ["2026-01-05"] }] })
      )
    ).toBeNull();
  });

  it("这个资源没配在别的单上 → 放行", () => {
    expect(resizeConflictReason(["2026-01-01"], assigned, uses({}))).toBeNull();
  });

  it("没分配的单子随便拖", () => {
    expect(resizeConflictReason(["2026-01-01"], [], uses({ s1: [{ orderId: "B", days: ["2026-01-01"] }] }))).toBeNull();
  });

  it("物主没名字也要给得出话说", () => {
    const reason = resizeConflictReason(
      ["2026-01-01"],
      [{ resourceId: "s1", holderName: null }],
      uses({ s1: [{ orderId: "B", days: ["2026-01-01"] }] })
    );
    expect(reason).toContain("这个资源");
  });
});
