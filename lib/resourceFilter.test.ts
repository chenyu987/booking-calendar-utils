import { describe, it, expect } from "vitest";
import {
  parseResourceFilters,
  hasAnyResourceFilter,
  matchesResourceFilters,
  resourceFiltersQuery,
  resourceReturnPath,
  EMPTY_RESOURCE_FILTERS,
  DEFAULT_RESOURCE_FILTERS,
  type FilterableResource,
} from "./resourceFilter";
import { badgeKind } from "./resourceStatus";

describe("resourceFiltersQuery / resourceReturnPath —— 编辑、取消、保存不丢筛选", () => {
  it("筛选拼回 URL 参数名，空的不拼；extra 带上 edit", () => {
    const f = { ...DEFAULT_RESOURCE_FILTERS, provider: "老李", ageMin: "20", validFrom: "2026-12-01" };
    expect(resourceFiltersQuery(f, { edit: "s1" })).toBe("?provider=%E8%80%81%E6%9D%8E&agemin=20&vfrom=2026-12-01&edit=s1");
  });

  it("默认（只看出租中）就是空串；「全部状态」写成 sstatus=all", () => {
    expect(resourceFiltersQuery(DEFAULT_RESOURCE_FILTERS)).toBe("");
    expect(resourceFiltersQuery(EMPTY_RESOURCE_FILTERS)).toBe("?sstatus=all");
  });

  it("挂牌状态默认出租中；all = 不筛；带 edit 跳过来的按全部（要改的资源可能过期了）", () => {
    expect(parseResourceFilters({}).sstatus).toBe("active");
    expect(parseResourceFilters({ sstatus: "all" }).sstatus).toBe("");
    expect(parseResourceFilters({ edit: "s1" }).sstatus).toBe("");
    expect(parseResourceFilters({ edit: "s1", sstatus: "paused" }).sstatus).toBe("paused");
    // 「全部」来回一趟还是全部，不会变回默认
    const sp = Object.fromEntries(new URLSearchParams(resourceFiltersQuery(EMPTY_RESOURCE_FILTERS).slice(1)));
    expect(parseResourceFilters(sp)).toEqual(EMPTY_RESOURCE_FILTERS);
  });

  it("跟 parseResourceFilters 来回一趟不走样", () => {
    const f = { ...EMPTY_RESOURCE_FILTERS, item: "beta-base,beta-unknown", gender: "female" as const, booked: "no" as const, sstatus: "unavailable" as const };
    const sp = Object.fromEntries(new URLSearchParams(resourceFiltersQuery(f).slice(1)));
    expect(parseResourceFilters(sp)).toEqual(f);
  });

  it("保存后回到筛过的列表，edit 不带（退出编辑态）", () => {
    expect(resourceReturnPath("?provider=Zoey&edit=s1")).toBe("/admin/resources?provider=Zoey");
  });

  it("**交上来的查询串只认筛选参数**，别的丢掉 —— 永远停在 /admin/resources", () => {
    expect(resourceReturnPath("next=https://evil.example&item=bogus")).toBe("/admin/resources");
    expect(resourceReturnPath("")).toBe("/admin/resources");
  });
});

const base: FilterableResource = {
  providerName: "Zoey Lee",
  itemKind: "alpha",
  holderName: "sara lee",
  holderGender: "female",
  age: 30,
  rangeStart: "2026-08-30",
  rangeEnd: "2026-09-20",
  bookingCount: 3,
  badge: "active",
};
const f = (over: Partial<typeof EMPTY_RESOURCE_FILTERS>) => ({
  ...EMPTY_RESOURCE_FILTERS,
  ...over,
});

describe("parseResourceFilters", () => {
  it("认不出来的值当没筛", () => {
    const got = parseResourceFilters({ item: "月资源", gender: "X", booked: "?" });
    expect(got.item).toBe("");
    expect(got.gender).toBe("");
    expect(got.booked).toBe("");
  });
  it("参数名对得上", () => {
    const got = parseResourceFilters({ agemin: "20", agemax: "40", vfrom: "a", vto: "b" });
    expect(got.ageMin).toBe("20");
    expect(got.ageMax).toBe("40");
    expect(got.validFrom).toBe("a");
    expect(got.validTo).toBe("b");
  });
});

describe("hasAnyResourceFilter", () => {
  it("默认（只看出租中）算没筛；改成全部状态算筛了", () => {
    expect(hasAnyResourceFilter(DEFAULT_RESOURCE_FILTERS)).toBe(false);
    expect(hasAnyResourceFilter(EMPTY_RESOURCE_FILTERS)).toBe(true);
  });
  it("任意一个有值就算筛了", () => {
    expect(hasAnyResourceFilter(f({ item: "alpha" }))).toBe(true);
  });
});

describe("matchesResourceFilters", () => {
  it("没筛就全留", () => {
    expect(matchesResourceFilters(base, EMPTY_RESOURCE_FILTERS)).toBe(true);
  });

  it("Provider 和物主姓名都是包含匹配、不分大小写", () => {
    expect(matchesResourceFilters(base, f({ provider: "zoey" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ holder: "SARA" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ holder: "oshn" }))).toBe(false);
  });

  it("物主姓名没填的资源，一按姓名筛就不出现", () => {
    expect(matchesResourceFilters({ ...base, holderName: null }, f({ holder: "s" }))).toBe(false);
  });

  it("资源类型和性别是精确匹配", () => {
    expect(matchesResourceFilters(base, f({ item: "alpha" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ item: "beta" }))).toBe(false);
    expect(matchesResourceFilters(base, f({ gender: "female" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ gender: "male" }))).toBe(false);
  });

  describe("年龄", () => {
    it("上下限都判", () => {
      expect(matchesResourceFilters(base, f({ ageMin: "25", ageMax: "35" }))).toBe(true);
      expect(matchesResourceFilters(base, f({ ageMin: "31" }))).toBe(false);
      expect(matchesResourceFilters(base, f({ ageMax: "29" }))).toBe(false);
    });
    it("边界是闭区间", () => {
      expect(matchesResourceFilters(base, f({ ageMin: "30", ageMax: "30" }))).toBe(true);
    });
    it("没填生日算不出年龄，一按年龄筛就不出现", () => {
      expect(matchesResourceFilters({ ...base, age: null }, f({ ageMin: "1" }))).toBe(false);
    });
    it("输了非数字当没填，别把整张表筛空", () => {
      expect(matchesResourceFilters(base, f({ ageMin: "abc" }))).toBe(true);
    });
  });

  describe("有效期", () => {
    it("起始日不早于", () => {
      expect(matchesResourceFilters(base, f({ validFrom: "2026-08-01" }))).toBe(true);
      expect(matchesResourceFilters(base, f({ validFrom: "2026-09-01" }))).toBe(false);
    });
    it("结束日不晚于", () => {
      expect(matchesResourceFilters(base, f({ validTo: "2026-09-30" }))).toBe(true);
      expect(matchesResourceFilters(base, f({ validTo: "2026-09-10" }))).toBe(false);
    });
    it("两头一起填 = 整段有效期落在这个区间里", () => {
      expect(
        matchesResourceFilters(base, f({ validFrom: "2026-08-01", validTo: "2026-09-30" }))
      ).toBe(true);
    });
    it("有效期没填的资源，一按有效期筛就不出现", () => {
      expect(matchesResourceFilters({ ...base, rangeStart: null }, f({ validFrom: "2026-01-01" }))).toBe(false);
    });
  });

  describe("排期", () => {
    const idle = { ...base, bookingCount: 0 };
    it("有排期", () => {
      expect(matchesResourceFilters(base, f({ booked: "yes" }))).toBe(true);
      expect(matchesResourceFilters(idle, f({ booked: "yes" }))).toBe(false);
    });
    it("完全没排——找空着的资源", () => {
      expect(matchesResourceFilters(idle, f({ booked: "no" }))).toBe(true);
      expect(matchesResourceFilters(base, f({ booked: "no" }))).toBe(false);
    });
  });

  it("挂牌状态是精确匹配", () => {
    expect(matchesResourceFilters(base, f({ sstatus: "active" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ sstatus: "paused" }))).toBe(false);
  });

  it("挂牌状态按**显示的标签**筛：库里还是 active 的过期资源，筛「出租中」不该出现，筛「已过期」才出现", () => {
    // 页面传的是 badgeKind(resource)：status=active、有效期全结束了 → expired
    const expiredCard = { status: "active", deleted_at: null, validity: "{[2020-01-01,2020-05-31)}" };
    const row = { ...base, badge: badgeKind(expiredCard) };
    expect(matchesResourceFilters(row, f({ sstatus: "active" }))).toBe(false);
    expect(matchesResourceFilters(row, f({ sstatus: "expired" }))).toBe(true);
  });

  it("「不可租」= 暂停 + 已过期 + 已下架，不含出租中和已删除", () => {
    const pick = (badge: FilterableResource["badge"]) =>
      matchesResourceFilters({ ...base, badge }, f({ sstatus: "unavailable" }));
    expect(pick("paused")).toBe(true);
    expect(pick("expired")).toBe(true);
    expect(pick("archived")).toBe(true);
    expect(pick("active")).toBe(false);
    expect(pick("deleted")).toBe(false);
  });

  it("URL 里乱写的状态当默认（出租中）", () => {
    expect(parseResourceFilters({ sstatus: "bogus" }).sstatus).toBe("active");
    expect(parseResourceFilters({ sstatus: "expired" }).sstatus).toBe("expired");
  });

  it("多个条件是「而且」", () => {
    expect(matchesResourceFilters(base, f({ item: "alpha", gender: "female" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ item: "alpha", gender: "male" }))).toBe(false);
  });
});

describe("资源类型多选 / 地址 / 谁的联系人", () => {
  const row = { ...base };
  it("资源类型勾了几种，是其中一种就留", () => {
    expect(matchesResourceFilters({ ...row, itemKind: "beta-full" }, f({ item: "alpha,beta-full" }))).toBe(true);
    expect(matchesResourceFilters({ ...row, itemKind: "beta-unknown" }, f({ item: "alpha,beta-full" }))).toBe(false);
    expect(parseResourceFilters({ item: "beta-full,alpha" }).item).toBe("alpha,beta-full");
  });
  it("地址按包含筛，不分大小写；没填地址的筛不出来", () => {
    expect(matchesResourceFilters({ ...row, address: "Vancouver, BC, 加拿大" }, f({ addr: "vancouver" }))).toBe(true);
    expect(matchesResourceFilters({ ...row, address: null }, f({ addr: "vancouver" }))).toBe(false);
  });
  it("谁的联系人：某个管理员 / 还没标", () => {
    expect(matchesResourceFilters({ ...row, contactIds: ["a1", "a2"] }, f({ contact: "a2" }))).toBe(true);
    expect(matchesResourceFilters({ ...row, contactIds: ["a1"] }, f({ contact: "a2" }))).toBe(false);
    expect(matchesResourceFilters({ ...row, contactIds: [] }, f({ contact: "none" }))).toBe(true);
  });
});

