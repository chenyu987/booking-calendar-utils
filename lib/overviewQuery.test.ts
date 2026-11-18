import { describe, it, expect } from "vitest";
import { overviewHref, parseOverviewQuery } from "./overviewQuery";

const admins = [{ id: "a1", name: "Admin1" }];
const q = (s: string) => new URLSearchParams(s);

describe("parseOverviewQuery", () => {
  it("坏值当没筛：认不出的状态、不在名单里的管理员", () => {
    const r = parseOverviewQuery(q("ostatus=乱写&oadmin=谁&region=regionB"), admins);
    expect(r.orderFilter).toEqual({ region: "regionB", mtn: "", status: "", admin: "" });
    expect(r.hasOrderFilter).toBe(true);
  });
  it("资源筛选的默认值：挂牌状态默认只看出租中，搜索词小写", () => {
    const r = parseOverviewQuery(q("q=  Evan "), admins);
    expect(r.resourceFilter).toMatchObject({ sstatus: "active", q: "evan" });
    expect(r.showAllCards).toBe(false);
  });
});

describe("overviewHref", () => {
  it("在当前筛选上改几个：空字符串 = 去掉；默认值不写进 URL", () => {
    const cur = q("season=25-26-na&region=regionB&ostatus=created&sstatus=active&q=e");
    expect(overviewHref(cur, { region: "", mtn: "locaa" })).toBe(
      "/admin/overview?season=25-26-na&q=e&mtn=locaa&ostatus=created"
    );
  });
  it("什么都没有就是光秃秃的地址；不认识的参数不带", () => {
    expect(overviewHref(q("foo=1"))).toBe("/admin/overview");
  });
});
