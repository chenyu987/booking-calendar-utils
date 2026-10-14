import { describe, expect, it } from "vitest";
import { gapFor, nameCandidates, resourceOpenFor, type PanelOrder } from "./assignPanel";

const order: PanelOrder = {
  id: "o1",
  customerId: "r1",
  customerDob: null,
  location: "locaa",
  demandDays: ["2026-01-10", "2026-01-11"],
  maleGap: 1,
  femaleGap: 0,
  assignedResourceIds: [],
};
const card = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  provider_id: "w1",
  holder_name: "Justin",
  holder_gender: "male",
  holder_date_of_birth: null,
  item_type: "alpha",
  validity: "{(,)}",
  status: "active",
  ...over,
});

describe("resourceOpenFor：这个资源现在能不能配给这一单（不看性别缺口）", () => {
  it("挂牌中、有效期不限、那几天空着：能", () => {
    expect(resourceOpenFor(card(), order, [])).toBe(true);
  });
  it("暂停的资源：不能", () => {
    expect(resourceOpenFor(card({ status: "paused" }), order, [])).toBe(false);
  });
  it("那几天里有一天已经被占了：不能", () => {
    expect(resourceOpenFor(card(), order, ["2026-01-11"])).toBe(false);
  });
  it("有效期盖不住订单的日子：不能", () => {
    expect(resourceOpenFor(card({ validity: "{[2025-11-01,2025-12-31)}" }), order, [])).toBe(false);
  });
});

describe("gapFor", () => {
  it("按资源的性别取缺口，性别没填算 0", () => {
    expect(gapFor(order, "male")).toBe(1);
    expect(gapFor(order, "female")).toBe(0);
    expect(gapFor(order, null)).toBe(0);
  });
});

describe("nameCandidates：浮动条里打名字能叫出哪些资源", () => {
  it("只列配得上、这个性别还有缺口、还没配给这单的", () => {
    const all = [
      card({ id: "ok", holder_name: "Justin" }),
      card({ id: "female", holder_name: "Amy", holder_gender: "female" }), // 女资源缺口是 0
      card({ id: "busy", holder_name: "Victor" }), // 那几天被占了
      card({ id: "mine", holder_name: "Gao" }), // 已经配给这单
    ];
    const got = nameCandidates({ ...order, assignedResourceIds: ["mine"] }, all, { busy: ["2026-01-10"] }, []);
    expect(got.map((c) => c.id)).toEqual(["ok"]);
    expect(got[0].hint).toContain("男");
  });
  it("没名字的资源叫不出来（打字匹配不到它）", () => {
    expect(nameCandidates(order, [card({ holder_name: "  " })], {}, [])).toEqual([]);
  });
});
