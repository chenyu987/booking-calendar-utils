import { describe, it, expect } from "vitest";
import { oldSelfFor, claimSuggestions, mergeBlockReason, chatGap, type ClaimPerson } from "./selfClaim";

const old: ClaimPerson = { id: "old", chat_name: "小王", chat_id: null, auth_user_id: null };
const me: ClaimPerson = { id: "me", chat_name: " 小王 ", chat_id: "wx123", auth_user_id: "auth-1" };

describe("oldSelfFor", () => {
  it("登录的新人填的昵称对上一个没绑账号的老客人", () => {
    expect(oldSelfFor(me, [old, me])?.id).toBe("old");
  });

  it("昵称对不上时拿账号对", () => {
    const o = { id: "o2", chat_name: "别的名字", chat_id: "wx123", auth_user_id: null };
    expect(oldSelfFor({ ...me, chat_name: "改了名" }, [o, me])?.id).toBe("o2");
  });

  it("没登录账号的人不找（管理员录的老客人之间不互相提示）", () => {
    expect(oldSelfFor({ ...me, auth_user_id: null }, [old, me])).toBeNull();
  });

  it("老客人已经绑了登录账号的不算", () => {
    expect(oldSelfFor(me, [{ ...old, auth_user_id: "auth-2" }, me])).toBeNull();
  });

  it("对上多个就当没对上，不猜", () => {
    const old2 = { ...old, id: "old2" };
    expect(oldSelfFor(me, [old, old2, me])).toBeNull();
  });

  it("精确匹配：大小写、中间空格都算数", () => {
    const o = { id: "o", chat_name: "Wang Xiao", chat_id: null, auth_user_id: null };
    expect(oldSelfFor({ ...me, chat_name: "wang xiao", chat_id: null }, [o, me])).toBeNull();
  });
});

describe("claimSuggestions", () => {
  it("只列登录进来的新人", () => {
    const s = claimSuggestions([old, me]);
    expect(s.map((x) => [x.me.id, x.old.id])).toEqual([["me", "old"]]);
  });
});

describe("mergeBlockReason", () => {
  it("提示着的那一对放行", () => {
    expect(mergeBlockReason("me", "old", [old, me])).toBeNull();
  });

  it("随便拿两个 id 来合要拦", () => {
    const other = { id: "x", chat_name: "张三", chat_id: null, auth_user_id: null };
    expect(mergeBlockReason("me", "x", [old, other, me])).not.toBeNull();
  });

  it("反过来（拿老客人当被删的那个）要拦", () => {
    expect(mergeBlockReason("old", "me", [old, me])).not.toBeNull();
  });

  it("人已经不在了要拦", () => {
    expect(mergeBlockReason("gone", "old", [old, me])).not.toBeNull();
  });
});

describe("chatGap", () => {
  it("两样都有才算齐", () => {
    expect(chatGap({ chat_name: "小王", chat_id: "wx" })).toBeNull();
    expect(chatGap({ chat_name: "小王", chat_id: " " })).toBe("账号");
    expect(chatGap({ chat_name: null, chat_id: "wx" })).toBe("昵称");
    expect(chatGap(null)).toBe("昵称和账号");
  });
});
