import { describe, it, expect } from "vitest";
import { readNoteText } from "./orderNote";

describe("readNoteText", () => {
  it("普通备注原样返回", () => {
    expect(readNoteText("尾款没结")).toBe("尾款没结");
  });

  it("两边空格去掉", () => {
    expect(readNoteText("  尾款没结  ")).toBe("尾款没结");
  });

  it("空的都当没备注", () => {
    expect(readNoteText(null)).toBe("");
    expect(readNoteText(undefined)).toBe("");
    expect(readNoteText("")).toBe("");
    expect(readNoteText("   ")).toBe("");
  });

  it("取消原因的 JSON 信封拆出 detail，不把整段 JSON 印出来", () => {
    const raw = JSON.stringify({
      kind: "order-reason-v1",
      category: "provider_unavailable",
      detail: "物主自己要用",
      previousNote: "",
      updatedAt: "2026-09-09T06:28:59.397Z",
    });
    expect(readNoteText(raw)).toBe("物主自己要用");
  });

  it("信封里没有 detail 就当没备注，别把 category 那种内部枚举印出来", () => {
    expect(readNoteText('{"kind":"order-reason-v1","category":"provider_unavailable"}')).toBe("");
  });

  it("别的 JSON 不认，原样返回——不能替用户瞎猜", () => {
    expect(readNoteText('{"a":1}')).toBe('{"a":1}');
  });

  it("以 { 开头但不是合法 JSON 的普通备注，不能被吞掉", () => {
    expect(readNoteText("{尾款没结")).toBe("{尾款没结");
  });
});
