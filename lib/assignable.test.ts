import { describe, it, expect } from "vitest";
import { assignBlockReason } from "./assignable";

// 分配的五条校验现在只有这一份，三条路径共用（排期总览分配、匹配台 chosen、
// 物主提意向）。集成测试在 tests/assignRoute.test.ts 里从真 Route Handler 进去
// 各验了一遍，这里只盯**顺序** —— 报错给的是第一条不成立的，顺序一乱，
// 人看到的原因就换了一个，那些集成用例的断言也会跟着漂。
const order = {
  demand_days: ["2026-09-10", "2026-09-11"],
  male_count: 1,
  female_count: 0,
  location: "locbl",
};
const resource = {
  id: "s1",
  status: "active",
  holder_name: "阿男",
  holder_gender: "male",
  item_type: "alpha",
  validity: [{ start: "2026-06-01", end: "2027-05-01" }],
};
const ok = { order, resource, alreadyAssigned: [], resourceBookedDays: [] };

describe("assignBlockReason", () => {
  it("五条都过就放行", () => {
    expect(assignBlockReason(ok)).toBe(null);
  });

  it("物主删掉的资源排在最前面 —— 它压过一切", () => {
    const r = assignBlockReason({
      ...ok,
      resource: { ...resource, deleted_at: "2026-09-14T00:00:00Z", status: "paused" },
    });
    expect(r).toContain("删掉了");
  });

  it("挂牌状态排在最前 —— 哪怕别的也不成立，先说这条", () => {
    const r = assignBlockReason({
      ...ok,
      resource: { ...resource, status: "paused", validity: [{ start: "2026-06-01", end: "2026-07-01" }] },
    });
    expect(r).toBe("这个资源不在出租中");
  });

  it("配多了排在类型前面", () => {
    const r = assignBlockReason({
      ...ok,
      // 已经配了一张男资源，这一单只要一张；同时类型也不对
      resource: { ...resource, item_type: "beta" },
      alreadyAssigned: [{ id: "other", holder_gender: "male" }],
    });
    expect(r).toContain("已经配齐了");
  });

  it("类型排在有效期前面", () => {
    const r = assignBlockReason({
      ...ok,
      resource: { ...resource, item_type: "beta", validity: [{ start: "2026-06-01", end: "2026-07-01" }] },
    });
    expect(r).toContain("进不去");
  });

  it("有效期排在撞天前面", () => {
    const r = assignBlockReason({
      ...ok,
      resource: { ...resource, validity: [{ start: "2026-06-01", end: "2026-07-01" }] },
      resourceBookedDays: ["2026-09-10"],
    });
    expect(r).toContain("覆盖不了");
  });

  it("撞天是最后一条，报出具体是哪天", () => {
    const r = assignBlockReason({ ...ok, resourceBookedDays: ["2026-09-11"] });
    expect(r).toContain("2026-09-11");
  });
});
