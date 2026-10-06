import { describe, it, expect } from "vitest";
import { displayName, displayNameField, formatPerson, selfDisplayName } from "./person";

describe("displayName：后台显示哪个名字", () => {
  it("**昵称优先** —— 管理员是拿昵称认人的（排期总览上显示的就是它）", () => {
    expect(displayName({ first_name: "Amy", chat_name: "小雨", chat_id: "xue_88" })).toBe("小雨");
  });

  it("没有昵称（自己注册、还没加好友的）：退回称呼（名 + 姓）", () => {
    expect(displayName({ first_name: "Zoey", last_name: "Lee", chat_id: "z" })).toBe("Zoey Lee");
  });

  it("都没有：账号；再没有给 fallback", () => {
    expect(displayName({ chat_id: "wx123" })).toBe("wx123");
    expect(displayName({})).toBe("?");
    expect(displayName(null, "-")).toBe("-");
  });

  it("空格不算有", () => {
    expect(displayName({ chat_name: "  ", first_name: "Amy" })).toBe("Amy");
  });
});

describe("selfDisplayName：用户自己页面上显示的名字", () => {
  it("**称呼优先** —— 他自己起的名字", () => {
    expect(selfDisplayName({ first_name: "Amy", chat_name: "小雨" })).toBe("Amy");
  });

  it("没填称呼：昵称，再没有账号", () => {
    expect(selfDisplayName({ chat_name: "小雨", chat_id: "x" })).toBe("小雨");
    expect(selfDisplayName({ chat_id: "x" })).toBe("x");
    expect(selfDisplayName({}, "我的账号")).toBe("我的账号");
  });
});

describe("displayNameField：后台显示的是哪一列", () => {
  it("有昵称就是昵称；没有昵称、有称呼的（显示的是称呼）才是 first_name", () => {
    expect(displayNameField({ first_name: "Amy", chat_name: "小雨" })).toBe("chat_name");
    expect(displayNameField({ first_name: "Amy" })).toBe("first_name");
    expect(displayNameField({})).toBe("chat_name");
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
