import { describe, it, expect } from "vitest";
import {
  parseResourceFilters,
  hasAnyResourceFilter,
  matchesResourceFilters,
  resourceFiltersQuery,
  resourceReturnPath,
  EMPTY_RESOURCE_FILTERS,
  type FilterableResource,
} from "./resourceFilter";

describe("resourceFiltersQuery / resourceReturnPath —— 编辑、取消、保存不丢筛选", () => {
  it("筛选拼回 URL 参数名，空的不拼；extra 带上 edit", () => {
    const f = { ...EMPTY_RESOURCE_FILTERS, provider: "老李", ageMin: "20", validFrom: "2026-12-01" };
    expect(resourceFiltersQuery(f, { edit: "s1" })).toBe("?provider=%E8%80%81%E6%9D%8E&agemin=20&vfrom=2026-12-01&edit=s1");
  });

  it("什么都没筛就是空串", () => {
    expect(resourceFiltersQuery(EMPTY_RESOURCE_FILTERS)).toBe("");
  });

  it("跟 parseResourceFilters 来回一趟不走样", () => {
    const f = { ...EMPTY_RESOURCE_FILTERS, item: "beta" as const, gender: "female" as const, booked: "no" as const, sstatus: "active" };
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
  itemType: "alpha",
  holderName: "sara lee",
  holderGender: "female",
  age: 30,
  rangeStart: "2026-08-30",
  rangeEnd: "2026-09-20",
  bookingCount: 3,
  status: "active",
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
  it("全空是没筛", () => {
    expect(hasAnyResourceFilter(EMPTY_RESOURCE_FILTERS)).toBe(false);
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

  it("多个条件是「而且」", () => {
    expect(matchesResourceFilters(base, f({ item: "alpha", gender: "female" }))).toBe(true);
    expect(matchesResourceFilters(base, f({ item: "alpha", gender: "male" }))).toBe(false);
  });
});
