import { describe, expect, it } from "vitest";

import {
  aboutFilter,
  buildResolver,
  changedFields,
  formatValue,
  objectLabel,
  parseAboutId,
  parseWho,
  referencedIds,
  type ChangeEntry,
} from "./changeLog";

const ORDER = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-2222-2222-222222222222";
const RESOURCE = "33333333-3333-3333-3333-333333333333";
const LUCAS = "44444444-4444-4444-4444-444444444444";
const MUSHII = "55555555-5555-5555-5555-555555555555";

const entry = (p: Partial<ChangeEntry>): ChangeEntry => ({
  id: 1,
  at: "2026-10-12T00:00:00Z",
  table_name: "orders",
  row_id: ORDER,
  op: "update",
  old_row: null,
  new_row: null,
  admin_id: null,
  auth_user_id: null,
  ...p,
});

const resolver = buildResolver([], {
  people: [{ id: CUSTOMER, chat_name: "小明" }],
  orders: [{ id: ORDER, customer_id: CUSTOMER, demand_days: ["2026-12-25", "2026-12-24"], location: "Akaad" }],
  resources: [{ id: RESOURCE, holder_name: "Zoey" }],
  admins: [
    { id: LUCAS, name: "Admin1" },
    { id: MUSHII, name: "admin2" },
  ],
});

describe("changedFields", () => {
  it("修改只列前后不一样的列，不列 id / 时间戳 / party_size", () => {
    const f = changedFields(
      entry({
        old_row: { id: ORDER, amount: 100, status: "created", male_count: 1, party_size: 1, created_at: "x" },
        new_row: { id: ORDER, amount: 120, status: "created", male_count: 2, party_size: 2, created_at: "x" },
      })
    );
    expect(f.map((x) => x.field)).toEqual(["male_count", "amount"]);
  });

  it("数组按内容比，不按引用", () => {
    const f = changedFields(
      entry({ old_row: { demand_days: ["2026-12-24"] }, new_row: { demand_days: ["2026-12-24"] } })
    );
    expect(f).toEqual([]);
  });

  it("删除列出删掉的那一行里有值的列", () => {
    const f = changedFields(
      entry({ op: "delete", old_row: { id: ORDER, amount: 100, location: null, status: "created" } })
    );
    expect(f.map((x) => x.field)).toEqual(["amount", "status"]);
  });
});

describe("formatValue", () => {
  it("外键换成名字，订单的 admin_id 显示管理员名", () => {
    expect(formatValue("orders", "admin_id", MUSHII, {}, resolver)).toBe("admin2");
    expect(formatValue("orders", "customer_id", CUSTOMER, {}, resolver)).toBe("小明");
  });

  it("查不到的 id 标成已删除，不当空", () => {
    expect(formatValue("orders", "customer_id", "99999999-9999-9999-9999-999999999999", {}, resolver)).toBe(
      "已删除（99999999）"
    );
  });

  it("状态按表翻译", () => {
    expect(formatValue("orders", "status", "itemAssigned", {}, resolver)).toBe("已分配");
    expect(formatValue("resources", "status", "paused", {}, resolver)).toBe("暂停");
    expect(formatValue("payments", "status", "paid", {}, resolver)).toBe("已付");
  });

  it("日期数组排好序压成区间", () => {
    expect(formatValue("orders", "demand_days", ["2026-12-25", "2026-12-24"], {}, resolver)).toBe("12/24-25");
  });

  it("主要管理员那条设置的值是管理员 id，换成名字", () => {
    expect(formatValue("app_settings", "value", LUCAS, { key: "primary_admin_id" }, resolver)).toBe("Admin1");
    expect(formatValue("app_settings", "value", "0.1", { key: "referral_rate_default" }, resolver)).toBe("0.1");
  });

  it("空值显示「空」", () => {
    expect(formatValue("orders", "location", null, {}, resolver)).toBe("空");
  });
});

describe("objectLabel", () => {
  it("分配显示「哪一单 ← 哪个资源」，点进去看这一单", () => {
    const o = objectLabel(
      entry({ table_name: "order_assignments", row_id: "x", new_row: { order_id: ORDER, resource_id: RESOURCE } }),
      resolver
    );
    expect(o).toEqual({ text: "小明 12/24-25 Akaad ← Zoey 的资源", about: ORDER });
  });

  it("库里已经删掉的单，用删除那条记录自己的快照说清楚是哪一单", () => {
    const deleted = entry({
      op: "delete",
      row_id: "66666666-6666-6666-6666-666666666666",
      old_row: { customer_id: CUSTOMER, demand_days: ["2027-01-02"], location: null },
    });
    const r = buildResolver([deleted], {
      people: [{ id: CUSTOMER, chat_name: "小明" }],
      orders: [],
      resources: [],
      admins: [],
    });
    expect(objectLabel(deleted, r).text).toBe("小明 1/2");
  });
});

describe("referencedIds", () => {
  it("从主键和外键两头收 id", () => {
    const ids = referencedIds([
      entry({ admin_id: LUCAS, new_row: { customer_id: CUSTOMER, admin_id: MUSHII } }),
      entry({ table_name: "matches", row_id: "m", new_row: { order_id: ORDER, resource_id: RESOURCE } }),
    ]);
    expect([...ids.order]).toEqual([ORDER]);
    expect([...ids.person]).toEqual([CUSTOMER]);
    expect([...ids.resource]).toEqual([RESOURCE]);
    expect([...ids.admin].sort()).toEqual([LUCAS, MUSHII]);
  });
});

describe("筛选参数", () => {
  it("about 不是 uuid 就当没传 —— 它要拼进查询串", () => {
    expect(parseAboutId(ORDER)).toBe(ORDER);
    expect(parseAboutId(`${ORDER},row_id.neq.x`)).toBeNull();
    expect(parseAboutId(undefined)).toBeNull();
  });

  it("aboutFilter 同时查主键和指着它的外键", () => {
    const f = aboutFilter(ORDER);
    expect(f).toContain(`row_id.eq.${ORDER}`);
    expect(f).toContain(`new_row->>order_id.eq.${ORDER}`);
    expect(f).toContain(`old_row->>customer_id.eq.${ORDER}`);
  });

  it("who 只认管理员 id 和两个固定值", () => {
    expect(parseWho(LUCAS, [LUCAS])).toBe(LUCAS);
    expect(parseWho("self", [LUCAS])).toBe("self");
    expect(parseWho("hacker", [LUCAS])).toBe("");
  });
});

describe("字段顺序", () => {
  it("按「谁的、哪天、几个人、多少钱、状态」排，不按 jsonb 的键序", () => {
    const f = changedFields({
      op: "insert",
      old_row: null,
      new_row: { status: "created", location: "akaad", customer_id: "r", male_count: 1, demand_days: ["2026-12-24"], female_count: 0 },
    });
    expect(f.map((x) => x.field)).toEqual(["customer_id", "demand_days", "location", "male_count", "female_count", "status"]);
  });
});
