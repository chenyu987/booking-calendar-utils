import { describe, it, expect } from "vitest";
import {
  EMPTY_PROVIDER_FILTERS,
  hasAnyProviderFilter,
  matchesProviderFilters,
  providerFiltersQuery,
  providerReturnPath,
  parseProviderFilters,
  type FilterableProvider,
} from "./providerFilter";

const ADMINS = [
  { id: "a-admin1", name: "Admin1" },
  { id: "a-admin2", name: "admin2" },
];

const base: FilterableProvider = {
  chatName: "老李",
  selfName: "David",
  phone: "604-555-0101",
  chatId: "lee_wx",
  age: 30,
  status: "active",
  contactIds: ["a-admin1"],
  address: "123 Main St, Vancouver, BC V6B 1A1, 加拿大",
  note: "整季资源",
};

const f = (patch: Partial<typeof EMPTY_PROVIDER_FILTERS>) => ({ ...EMPTY_PROVIDER_FILTERS, ...patch });

describe("parseProviderFilters", () => {
  it("URL 参数名映射到字段，两头空白去掉", () => {
    expect(parseProviderFilters({ name: " 老李 ", agemin: "20", agemax: "40", contact: "a-admin1" }, ADMINS)).toEqual(
      f({ name: "老李", ageMin: "20", ageMax: "40", contact: "a-admin1" })
    );
  });

  it("认不出来的状态、管理员一律当没筛", () => {
    expect(parseProviderFilters({ status: "deleted", contact: "a-ghost" }, ADMINS)).toEqual(EMPTY_PROVIDER_FILTERS);
  });

  it("「还没标」照收", () => {
    expect(parseProviderFilters({ contact: "none" }, ADMINS).contact).toBe("none");
  });
});

describe("matchesProviderFilters", () => {
  it("什么都没筛全留", () => {
    expect(hasAnyProviderFilter(EMPTY_PROVIDER_FILTERS)).toBe(false);
    expect(matchesProviderFilters(base, EMPTY_PROVIDER_FILTERS)).toBe(true);
  });

  it("名字：昵称或称呼包含就算，不分大小写", () => {
    expect(matchesProviderFilters(base, f({ name: "李" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ name: "dav" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ name: "张三" }))).toBe(false);
  });

  it("电话 / 账号 / 地址 / 备注：包含就算", () => {
    expect(matchesProviderFilters(base, f({ phone: "555" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ chat: "LEE" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ address: "vancouver" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ note: "整季" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ address: "Toronto" }))).toBe(false);
    expect(matchesProviderFilters({ ...base, address: null }, f({ address: "a" }))).toBe(false);
  });

  it("年龄区间；没生日的人一按年龄筛就不出现", () => {
    expect(matchesProviderFilters(base, f({ ageMin: "25", ageMax: "35" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ ageMin: "31" }))).toBe(false);
    expect(matchesProviderFilters({ ...base, age: null }, f({ ageMax: "99" }))).toBe(false);
  });

  it("状态精确匹配", () => {
    expect(matchesProviderFilters(base, f({ status: "active" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ status: "blacklisted" }))).toBe(false);
  });

  it("谁的客人：某个人 = 挂了他的；还没标 = 一个都没挂的", () => {
    expect(matchesProviderFilters(base, f({ contact: "a-admin1" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ contact: "a-admin2" }))).toBe(false);
    expect(matchesProviderFilters(base, f({ contact: "none" }))).toBe(false);
    expect(matchesProviderFilters({ ...base, contactIds: [] }, f({ contact: "none" }))).toBe(true);
  });

  it("几个条件一起：都满足才留", () => {
    expect(matchesProviderFilters(base, f({ name: "李", status: "active", contact: "a-admin1" }))).toBe(true);
    expect(matchesProviderFilters(base, f({ name: "李", status: "inactive" }))).toBe(false);
  });
});

describe("providerFiltersQuery / providerReturnPath —— 编辑、取消、保存不丢筛选", () => {
  it("拼回 URL 参数名，空的不拼；extra 带上 edit", () => {
    expect(providerFiltersQuery(f({ phone: "604", ageMin: "20" }), { edit: "p1" })).toBe("?phone=604&agemin=20&edit=p1");
    expect(providerFiltersQuery(EMPTY_PROVIDER_FILTERS)).toBe("");
  });

  it("跟 parseProviderFilters 来回一趟不走样", () => {
    const all = f({ name: "老李", phone: "6", chat: "w", ageMin: "1", ageMax: "9", status: "inactive", contact: "a-admin2", address: "BC", note: "n" });
    const sp = Object.fromEntries(new URLSearchParams(providerFiltersQuery(all).slice(1)));
    expect(parseProviderFilters(sp, ADMINS)).toEqual(all);
  });

  it("保存后回到筛过的列表，edit 不带（退出编辑态）", () => {
    expect(providerReturnPath("?status=active&edit=p1", ADMINS)).toBe("/admin/providers?status=active");
  });

  it("**交上来的查询串只认筛选参数**，别的丢掉 —— 永远停在 /admin/providers", () => {
    expect(providerReturnPath("next=https://evil.example&contact=a-ghost", ADMINS)).toBe("/admin/providers");
    expect(providerReturnPath("", ADMINS)).toBe("/admin/providers");
  });
});
