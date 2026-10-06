import { describe, it, expect } from "vitest";
import { displayName, formatPerson } from "./person";

describe("displayName：后台显示哪个名字", () => {
  it("**昵称优先** —— 后台认人靠它", () => {
    expect(displayName({ chat_name: "小雨", first_name: "Xue", chat_id: "xue_88" })).toBe("小雨");
  });

  it("没有昵称：退回注册时自己填的称呼（名 + 姓）", () => {
    expect(displayName({ first_name: "Zoey", last_name: "Lee", chat_id: "zqwer5578" })).toBe("Zoey Lee");
  });

  it("名字都没有：用账号；再没有给 fallback", () => {
    expect(displayName({ chat_id: "wx123" })).toBe("wx123");
    expect(displayName({})).toBe("?");
    expect(displayName(null, "-")).toBe("-");
  });

  it("空格不算有", () => {
    expect(displayName({ chat_name: "  ", first_name: "Amy" })).toBe("Amy");
  });
});

describe("formatPerson：「昵称 (账号)」", () => {
  it("名字和账号都有", () => {
    expect(formatPerson({ chat_name: "Zoey", chat_id: "zqwer5578" })).toBe("Zoey (zqwer5578)");
  });

  it("没填账号：只有名字", () => {
    expect(formatPerson({ chat_name: "笔记测试" })).toBe("笔记测试");
  });

  it("名字本身就是退回来的账号：不重复写两遍", () => {
    expect(formatPerson({ chat_id: "wx123" })).toBe("wx123");
  });

  it("什么都没有", () => {
    expect(formatPerson({})).toBe("-");
    expect(formatPerson(null)).toBe("-");
  });
});
