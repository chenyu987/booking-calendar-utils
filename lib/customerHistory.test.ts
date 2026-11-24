import { describe, expect, it } from "vitest";
import { buildCustomerHistory, type HistoryOrderRow, type HistoryResourceRow } from "./customerHistory";

const order = (o: Partial<HistoryOrderRow> & { id: string; demand_days: string[] }): HistoryOrderRow => ({
  location: "akaad",
  status: "complete",
  male_count: 1,
  female_count: 0,
  order_assignments: [],
  ...o,
});

const resources: HistoryResourceRow[] = [
  { id: "s1", holder_name: "Emma", holder_gender: "female" },
  { id: "s2", holder_name: "Tom", holder_gender: "male" },
];

describe("buildCustomerHistory", () => {
  it("不列正在看的这一单；按季分组、新的在前；带出当时配的资源（持有人）", () => {
    const h = buildCustomerHistory(
      [
        order({ id: "now", demand_days: ["2026-12-20"] }),
        order({ id: "a", demand_days: ["2025-01-18", "2025-01-19"], order_assignments: [{ resource_id: "s1" }] }),
        order({ id: "b", demand_days: ["2025-12-24", "2025-12-25", "2025-12-27"], location: "locaa", order_assignments: [{ resource_id: "s2" }] }),
      ],
      resources,
      "now"
    );
    expect(h.total).toBe(2);
    expect(h.pastActive).toBe(2);
    expect(h.seasons.map((g) => g.season.key)).toEqual(["25-26-na", "24-25-na"]);
    const [b] = h.seasons[0].entries;
    // 日期不连续的一单是两段，地点名只写一次
    expect(b.label).toBe("12/24~12/25、12/27 locaa");
    expect(b.cards).toEqual([{ holder: "Tom", gender: "male" }]);
    expect(h.seasons[1].entries[0].cards).toEqual([{ holder: "Emma", gender: "female" }]);
  });

  it("取消的单照列但不算「以前用过」；这一单之后的单标出来、也不算", () => {
    const h = buildCustomerHistory(
      [
        order({ id: "now", demand_days: ["2026-01-10"] }),
        order({ id: "x", demand_days: ["2025-01-10"], status: "cancelled" }),
        order({ id: "y", demand_days: ["2026-02-01"] }),
      ],
      [],
      "now"
    );
    expect(h.total).toBe(2);
    expect(h.pastActive).toBe(0);
    const all = h.seasons.flatMap((g) => g.entries);
    expect(all.find((e) => e.orderId === "x")).toMatchObject({ inactive: true, later: false });
    expect(all.find((e) => e.orderId === "y")).toMatchObject({ inactive: false, later: true });
  });

  it("只有这一单 = 新客户", () => {
    const h = buildCustomerHistory([order({ id: "now", demand_days: ["2026-01-10"] })], [], "now");
    expect(h).toEqual({ seasons: [], pastActive: 0, total: 0 });
  });
});
