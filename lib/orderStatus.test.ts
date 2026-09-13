import { describe, it, expect } from "vitest";
import { statusColor, statusOptions, STATUS_LABELS } from "./orderStatus";

describe("statusColor", () => {
  it("每个 STATUS_LABELS 里的状态都能查到颜色", () => {
    for (const key of Object.keys(STATUS_LABELS)) {
      const c = statusColor(key);
      expect(c.bg).toBeTruthy();
      expect(c.border).toBeTruthy();
      expect(c.text).toBeTruthy();
    }
  });

  it("不认识的状态兜底成 created 的颜色", () => {
    expect(statusColor("不存在的状态")).toEqual(statusColor("created"));
  });
});

describe("statusOptions", () => {
  it("认得的状态：就是 STATUS_LABELS 那几条，不多不少", () => {
    const opts = statusOptions("complete");
    expect(opts.map((o) => o.value)).toEqual(Object.keys(STATUS_LABELS));
  });

  it("认不出来的状态要补在最前面，且 value 跟库里一模一样", () => {
    // 这一条盯的是真出过的事故：refunded 被删掉之后，那一单的 select
    // 匹配不上任何 option，浏览器把 value 落到第一项，
    // ClickOutsideDeselect 的「只存改过的」判断反而恒成立，
    // 点一下别处就把「待处理」悄悄写进了库。
    const opts = statusOptions("refunded");
    expect(opts[0]).toEqual({ value: "refunded", label: "refunded" });
    expect(opts).toHaveLength(Object.keys(STATUS_LABELS).length + 1);
  });

  it("补出来的那条就是第一项 —— 浏览器落到第一项时值也不会变", () => {
    // 光「补了一条」不够，必须**排在最前**：select 匹配不上时落的是第一项。
    // 补在末尾的话 value 仍然会变成 created，事故照旧。
    expect(statusOptions("refunded")[0].value).toBe("refunded");
  });

  it("空状态不补空选项", () => {
    for (const empty of ["", null, undefined]) {
      expect(statusOptions(empty).map((o) => o.value)).toEqual(
        Object.keys(STATUS_LABELS)
      );
    }
  });
});

