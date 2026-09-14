import { describe, it, expect } from "vitest";
import { validateResourceEdit, type ResourceEditInput } from "./resourceEdit";

const base: ResourceEditInput = {
  itemType: "alpha",
  holderName: "allen kuanw",
  holderGender: "male",
  dateRangeStart: "2026-09-07",
  dateRangeEnd: "2026-11-26",
  status: "active",
};
const current = { holder_gender: "male" };

describe("validateResourceEdit", () => {
  it("没排出去的资源，怎么改都行", () => {
    expect(
      validateResourceEdit(
        { ...base, holderGender: "female", dateRangeEnd: "2026-09-08" },
        current,
        []
      )
    ).toBe(null);
  });

  it("有效期照旧盖得住已排的日子就放行", () => {
    expect(validateResourceEdit(base, current, ["2026-09-10", "2026-09-12"])).toBe(null);
  });

  it("把有效期缩到盖不住已排的日子要拦住", () => {
    // 这个资源 9/12 已经排出去了，结束日期往前挪到 9/10 就把那一单架空了
    expect(
      validateResourceEdit({ ...base, dateRangeEnd: "2026-09-10" }, current, [
        "2026-09-10",
        "2026-09-12",
      ])
    ).toBe("range");
  });

  it("开始日期往后挪盖不住也要拦住", () => {
    expect(
      validateResourceEdit({ ...base, dateRangeStart: "2026-09-11" }, current, [
        "2026-09-10",
      ])
    ).toBe("range");
  });

  it("已经排出去的资源不给改持有人性别", () => {
    expect(
      validateResourceEdit({ ...base, holderGender: "female" }, current, ["2026-09-10"])
    ).toBe("gender");
  });

  it("已经排出去也能暂停出租 —— status 只管接不接新单", () => {
    expect(validateResourceEdit({ ...base, status: "paused" }, current, ["2026-09-10"])).toBe(
      null
    );
    expect(
      validateResourceEdit({ ...base, status: "archived" }, current, ["2026-09-10"])
    ).toBe(null);
  });

  // 有效期两头各自选填，留空 = 这一头不设限
  it("有效期两头都留空能存下去", () => {
    expect(
      validateResourceEdit({ ...base, dateRangeStart: "", dateRangeEnd: "" }, current, [])
    ).toBe(null);
  });

  it("已经排出去的资源，把有效期清空也行 —— 不设限什么都盖得住", () => {
    expect(
      validateResourceEdit({ ...base, dateRangeStart: "", dateRangeEnd: "" }, current, [
        "2026-09-10",
        "2026-09-12",
      ])
    ).toBe(null);
  });

  it("只留空一头：填了的那一头照样要盖住已排的日子", () => {
    // 开始日挪到 9/11，已排的 9/10 就露在外面了 —— 结束日空着也拦
    expect(
      validateResourceEdit(
        { ...base, dateRangeStart: "2026-09-11", dateRangeEnd: "" },
        current,
        ["2026-09-10"]
      )
    ).toBe("range");
    expect(
      validateResourceEdit(
        { ...base, dateRangeStart: "2026-09-01", dateRangeEnd: "" },
        current,
        ["2026-09-10"]
      )
    ).toBe(null);
  });

  it("只填一头的时候不比先后", () => {
    expect(
      validateResourceEdit({ ...base, dateRangeStart: "", dateRangeEnd: "2026-01-01" }, current, [])
    ).toBe(null);
  });

  it("结束日期早于开始日期", () => {
    expect(
      validateResourceEdit({ ...base, dateRangeEnd: "2026-09-01" }, current, [])
    ).toBe("dates");
  });

  it("必填字段空着或者值不认识", () => {
    expect(validateResourceEdit({ ...base, holderName: "  " }, current, [])).toBe("required");
    expect(validateResourceEdit({ ...base, holderGender: "" }, current, [])).toBe("required");
    expect(validateResourceEdit({ ...base, itemType: "" }, current, [])).toBe("required");
    // 有效期不在必填之列了，见上面那几条
  });

  it("塞一个不存在的状态过来", () => {
    expect(validateResourceEdit({ ...base, status: "deleted" }, current, [])).toBe("status");
  });
});
