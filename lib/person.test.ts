import { describe, it, expect } from "vitest";
import { formatPerson } from "./person";

describe("formatPerson", () => {
  it("姓名 + 聊天", () => {
    expect(formatPerson("Zoey", "Lee", "zqwer5578")).toBe("Zoey Lee (zqwer5578)");
  });

  it("没有姓就只出名 —— 库里 last_name 大多是空的", () => {
    expect(formatPerson("小明", null, "xiaoming_wx")).toBe("小明 (xiaoming_wx)");
  });

  it("没聊天就不带那个括号，不留一个空壳", () => {
    expect(formatPerson("笔记测试", null, null)).toBe("笔记测试");
  });

  it("名字空着但有聊天：至少还能照着聊天找人", () => {
    expect(formatPerson(null, null, "wx123")).toBe("? (wx123)");
  });

  it("什么都没有就是一横", () => {
    expect(formatPerson(null, null, null)).toBe("-");
    expect(formatPerson("  ", null, null)).toBe("-");
  });
});
