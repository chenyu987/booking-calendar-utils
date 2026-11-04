import { describe, it, expect } from "vitest";
import { containsPattern, orContains, orderHref, providerHref, personHits, normalizeQuery } from "./globalSearch";

describe("containsPattern / orContains", () => {
  it("用户打的 % _ 当字面字符，* 去掉", () => {
    expect(containsPattern("a_b")).toBe("%a\\_b%");
    expect(containsPattern("50%")).toBe("%50\\%%");
    expect(containsPattern("a*b")).toBe("%ab%");
  });

  it("值包双引号，名字里的逗号括号不会把 or 拆坏", () => {
    expect(orContains(["chat_name", "email"], "Li, (Amy)")).toBe(
      'chat_name.ilike."%Li, (Amy)%",email.ilike."%Li, (Amy)%"'
    );
  });

  it("引号和反斜杠再转义一层", () => {
    expect(orContains(["sender"], 'a"b')).toBe('sender.ilike."%a\\"b%"');
    expect(orContains(["sender"], "a_b")).toBe('sender.ilike."%a\\\\_b%"');
  });

  it("搜索词去两头空白、截长", () => {
    expect(normalizeQuery("  hi ")).toBe("hi");
    expect(normalizeQuery("x".repeat(100))).toHaveLength(64);
    expect(normalizeQuery(null)).toBe("");
  });
});

describe("orderHref", () => {
  it("带上第一天所在的季，往年的单子才在盘子上", () => {
    expect(orderHref({ id: "o1", demand_days: ["2025-01-03", "2024-12-30"] })).toBe(
      "/admin/overview?season=24-25-na&assign=o1"
    );
    expect(orderHref({ id: "o2", demand_days: ["2025-07-10"] })).toBe("/admin/overview?season=24-25-au&assign=o2");
  });

  it("没日子就不带季", () => {
    expect(orderHref({ id: "o3", demand_days: [] })).toBe("/admin/overview?assign=o3");
  });
});

describe("personHits", () => {
  const p = { id: "p1", chat_name: "小王", chat_id: "wx_wang", phone_number: "123" };

  it("既是客户又是物主：两条都出，客户在前", () => {
    const hits = personHits([p], new Set(["p1"]), new Set(["p1"]));
    expect(hits.map((h) => h.group)).toEqual(["客户", "物主"]);
    expect(hits[0].href).toBe("/admin/customers?focus=p1");
    expect(hits[0].sub).toBe("wx_wang · 123");
  });

  it("哪个身份都没有的人不出（身份表上没有他，点过去也找不到）", () => {
    expect(personHits([p], new Set(), new Set())).toEqual([]);
  });

  it("物主没昵称也没称呼，按账号筛", () => {
    expect(providerHref({ id: "x", chat_id: "wx1" })).toBe("/admin/providers?chat=wx1");
    expect(providerHref({ id: "x", chat_name: "张三", chat_id: "wx1" })).toBe(
      `/admin/providers?name=${encodeURIComponent("张三")}`
    );
  });
});
