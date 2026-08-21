import { describe, it, expect } from "vitest";
import { statusColor, STATUS_LABELS } from "./orderStatus";

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
