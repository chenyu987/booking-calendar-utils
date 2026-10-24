import { describe, expect, it } from "vitest";
import { formatRequestDates, formatRequestParty, matchRequestPerson, parseRequestStatus } from "./chatRequests";

describe("parseRequestStatus", () => {
  it("只认库里 check 的那四个", () => {
    expect(parseRequestStatus("contacted")).toBe("contacted");
    expect(parseRequestStatus("done")).toBeNull();
    expect(parseRequestStatus(undefined)).toBeNull();
    expect(parseRequestStatus("all")).toBeNull();
  });
});

describe("matchRequestPerson", () => {
  const people = [
    { id: "a", chat_name: "Alex Wang", chat_id: "alexw" },
    { id: "b", chat_name: "婷婷", chat_id: null },
    { id: "c", chat_name: "Sam", chat_id: null },
    { id: "d", chat_name: "Sam", chat_id: null },
  ];

  it("昵称精确对上，只去两头空白", () => {
    expect(matchRequestPerson("Alex Wang", people)?.id).toBe("a");
    expect(matchRequestPerson(" 婷婷 ", people)?.id).toBe("b");
  });

  it("空格、大小写不一样就不算对上", () => {
    expect(matchRequestPerson("alexwang", people)).toBeNull();
    expect(matchRequestPerson("alex wang", people)).toBeNull();
  });

  it("昵称对不上再看账号", () => {
    expect(matchRequestPerson("alexw", people)?.id).toBe("a");
    expect(matchRequestPerson("AlexW", people)).toBeNull();
  });

  it("对上两个人就当没对上，不猜", () => {
    expect(matchRequestPerson("Sam", people)).toBeNull();
  });

  it("对不上、空名字都是 null", () => {
    expect(matchRequestPerson("新来的", people)).toBeNull();
    expect(matchRequestPerson("", people)).toBeNull();
  });
});

describe("显示", () => {
  it("日期去掉前导 0，认不出的原样留着", () => {
    expect(formatRequestDates(["03-14", "03-15"])).toBe("3/14、3/15");
    expect(formatRequestDates(["周末"])).toBe("周末");
    expect(formatRequestDates(null)).toBe("");
  });

  it("男女分开写，都没有是 —", () => {
    expect(formatRequestParty(1, 1)).toBe("男1 女1");
    expect(formatRequestParty(0, 2)).toBe("女2");
    expect(formatRequestParty(0, 0)).toBe("—");
  });
});
