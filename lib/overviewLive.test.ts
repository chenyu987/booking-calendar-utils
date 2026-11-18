import { describe, it, expect } from "vitest";
import { collectChanges, mergeRaw, isEmptyRequest, type ChangeMsg, type RowsResponse } from "./overviewLive";
import type { OverviewRaw } from "./overviewModel";

const msg = (t: string, row: string, extra: Partial<ChangeMsg> = {}): ChangeMsg => ({ id: 1, t, row, op: "update", ...extra });

describe("collectChanges：一批广播换算成要重新拉哪几行", () => {
  it("订单本身 / 它的分配变了 → 重拉那一单；同一单多条只拉一次", () => {
    const r = collectChanges([
      msg("orders", "o1"),
      msg("order_assignments", "a9", { order: "o1" }),
      msg("order_assignments", "a8", { order: "o2", op: "delete" }),
    ]);
    expect(r.orders.sort()).toEqual(["o1", "o2"]);
  });

  it("备注、资源、人、每天备注各归各的；设置变了整页刷新", () => {
    const r = collectChanges([
      msg("order_notes", "o3", { order: "o3" }),
      msg("resources", "s1"),
      msg("people", "p1"),
      msg("day_notes", "2026-12-01"),
    ]);
    expect(r).toMatchObject({ notes: ["o3"], resources: ["s1"], customers: ["p1"], dayNotes: true, full: false });
    expect(collectChanges([msg("app_settings", "primary_admin_id")]).full).toBe(true);
  });

  it("这一页不显示的表（付款、意向、需求）不拉", () => {
    expect(isEmptyRequest(collectChanges([msg("payments", "x"), msg("matches", "y"), msg("chat_requests", "z")]))).toBe(true);
  });
});

describe("mergeRaw：拉回来的几行合进手里的数据", () => {
  const raw: OverviewRaw = {
    orders: [
      { id: "o1", amount: 100 },
      { id: "o2", amount: 200 },
    ],
    resources: [{ id: "s1", holder_name: "A" }],
    orderNotes: [{ order_id: "o1", internal_note: "旧备注" }],
    dayNotes: [],
  };
  const res = (over: Partial<RowsResponse>): RowsResponse => ({
    at: 0,
    orders: [],
    resources: [],
    notesFor: [],
    orderNotes: [],
    ...over,
  });

  it("改了的替换、没了的删掉、新的加上", () => {
    const m = mergeRaw(
      raw,
      res({
        orders: [
          { id: "o1", row: { id: "o1", amount: 150 } },
          { id: "o2", row: null },
          { id: "o3", row: { id: "o3", amount: 90 } },
        ],
        resources: [{ id: "s1", row: null }],
      })
    );
    expect(m.orders).toEqual([
      { id: "o1", amount: 150 },
      { id: "o3", amount: 90 },
    ]);
    expect(m.resources).toEqual([]);
  });

  it("备注：问了的那几单按回来的替换，没回来的 = 删了", () => {
    const m = mergeRaw(raw, res({ notesFor: ["o1", "o2"], orderNotes: [{ order_id: "o2", internal_note: "新" }] }));
    expect(m.orderNotes).toEqual([{ order_id: "o2", internal_note: "新" }]);
  });

  it("**正在编辑的那一单先不动**（合进去编辑框会重挂、刚打的字没了）", () => {
    const m = mergeRaw(
      raw,
      res({ orders: [{ id: "o1", row: { id: "o1", amount: 999 } }], notesFor: ["o1"], orderNotes: [] }),
      new Set(["o1"])
    );
    expect(m.orders.find((o) => o.id === "o1")!.amount).toBe(100);
    expect(m.orderNotes).toEqual(raw.orderNotes);
  });

  it("没变的部分原样复用（同一个引用：模型层的 useMemo 能少算）", () => {
    const m = mergeRaw(raw, res({ dayNotes: [{ day: "2026-12-01", note: "x" }] }));
    expect(m.orders).toBe(raw.orders);
    expect(m.resources).toBe(raw.resources);
  });
});
