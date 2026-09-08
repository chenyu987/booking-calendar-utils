import { describe, it, expect } from "vitest";
import {
  canBulkSet,
  bulkSetRejection,
  commonStatus,
  normalizeIds,
  BULK_SETTABLE_STATUSES,
} from "./bulkStatus";
import { STATUS_LABELS } from "./orderStatus";

describe("canBulkSet", () => {
  it("下游的人工流程状态可以批量设", () => {
    expect(canBulkSet("pendingPickUp")).toBe(true);
    expect(canBulkSet("pendingPayment")).toBe(true);
    expect(canBulkSet("complete")).toBe(true);
    expect(canBulkSet("cancelled")).toBe(true);
    expect(canBulkSet("refunded")).toBe(true);
  });

  it("created / itemAssigned 是分配算出来的，不给批量设", () => {
    expect(canBulkSet("created")).toBe(false);
    expect(canBulkSet("itemAssigned")).toBe(false);
  });

  it("不认识的状态一律拒绝", () => {
    expect(canBulkSet("")).toBe(false);
    expect(canBulkSet("shipped")).toBe(false);
  });

  it("放开的每个状态都得是真实存在的状态，别写错拼写", () => {
    for (const s of BULK_SETTABLE_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe("bulkSetRejection", () => {
  it("能批量设的没有拒绝理由", () => {
    expect(bulkSetRejection("complete")).toBeNull();
  });

  it("分配推出来的那两个，理由要说清是为什么", () => {
    expect(bulkSetRejection("itemAssigned")).toContain("分配进度");
    expect(bulkSetRejection("created")).toContain("分配进度");
  });

  it("其它的算未知状态", () => {
    expect(bulkSetRejection("nope")).toBe("未知状态");
  });
});

describe("commonStatus", () => {
  it("全一样就返回那个状态", () => {
    expect(commonStatus(["complete", "complete"])).toBe("complete");
  });

  it("不一样返回 null——界面要显示「多个状态」", () => {
    expect(commonStatus(["complete", "cancelled"])).toBeNull();
  });

  it("空集合也是 null", () => {
    expect(commonStatus([])).toBeNull();
  });

  it("一个也算全一样", () => {
    expect(commonStatus(["created"])).toBe("created");
  });
});

describe("normalizeIds", () => {
  it("去重", () => {
    expect(normalizeIds(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("去掉空串和空白", () => {
    expect(normalizeIds(["a", "", "  "])).toEqual(["a"]);
  });

  it("两边空格去掉", () => {
    expect(normalizeIds([" a "])).toEqual(["a"]);
  });

  it("非数组、非字符串元素都扔掉", () => {
    expect(normalizeIds("a")).toEqual([]);
    expect(normalizeIds(null)).toEqual([]);
    expect(normalizeIds([1, {}, "a"])).toEqual(["a"]);
  });
});
