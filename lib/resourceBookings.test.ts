import { describe, expect, it } from "vitest";
import { bookingPopupRows } from "./resourceBookings";

describe("bookingPopupRows（排期浮层）", () => {
  it("按日子从早到晚排，一单一行：日子、年份、地点、客户、状态", () => {
    const rows = bookingPopupRows([
      { id: "b", demand_days: ["2026-12-20", "2026-12-21"], location: "locaa", status: "itemAssigned", customers: { chat_name: "小王" } },
      { id: "a", demand_days: ["2025-01-03"], location: null, status: "completed", customers: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[1]).toMatchObject({ location: "locaa", customer: "小王", year: "26" });
    expect(rows[1].days).toContain("12/20");
    expect(rows[0]).toMatchObject({ location: "?", customer: "?" });
    expect(rows[0].status).not.toBe("");
  });

  it("没单子就是空的", () => {
    expect(bookingPopupRows([])).toEqual([]);
  });
});
