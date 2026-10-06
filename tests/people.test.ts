import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 人和身份分开（迁移 0017）之后的三件事：
//   - 登录认领认的是**人**：一个本来只是客户的人从物主入口登录，落到同一个人、补一行 providers，
//     而不是在 providers 里另起一个新人（合表之前就是这么裂成两行的）
//   - 建人 + 身份那两步不在一个事务里，身份那步失败要把人撤掉
//   - 查身份表时 `...people(…)` 摊平出来的形状跟合表之前一样（页面读 r.first_name 不用改）

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
function seed(tables = {}) {
  fake = createFakeSupabase({ people: [], customers: [], providers: [], ...tables });
  (globalThis as any).__fakeSupabase = fake.client;
}

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("登录认领认的是人", () => {
  it("**已经是客户的人从物主入口登录：同一个人，补一行 providers**", async () => {
    seed({
      people: [{ id: "p1", email: "a@x.com", auth_user_id: "u1", first_name: "阿明" }],
      customers: [{ id: "p1" }],
    });
    const { claimProvider } = await import("@/lib/accountClaim");
    expect(await claimProvider("u1", "a@x.com")).toBe("p1");
    expect(fake.db.providers.map((o: any) => o.id)).toEqual(["p1"]);
    // 没有另起一个人
    expect(fake.db.people).toHaveLength(1);
  });

  it("再登录一次不会重复补身份", async () => {
    seed({
      people: [{ id: "p1", auth_user_id: "u1" }],
      customers: [{ id: "p1" }],
      providers: [{ id: "p1" }],
    });
    const { claimProvider } = await import("@/lib/accountClaim");
    await claimProvider("u1", null);
    expect(fake.db.providers).toHaveLength(1);
  });

  it("按邮箱认领一个还没绑账号的人，不分大小写", async () => {
    seed({ people: [{ id: "p1", email: "Admin1@X.com", auth_user_id: null }], customers: [{ id: "p1" }] });
    const { claimCustomer } = await import("@/lib/accountClaim");
    expect(await claimCustomer("u9", "admin1@x.com")).toBe("p1");
    expect(fake.db.people[0].auth_user_id).toBe("u9");
  });

  it("已经被别的账号认领过的人，不会被按邮箱抢走", async () => {
    seed({ people: [{ id: "p1", email: "a@x.com", auth_user_id: "someone-else" }] });
    const { claimCustomer } = await import("@/lib/accountClaim");
    const id = await claimCustomer("u2", "a@x.com");
    expect(id).not.toBe("p1");
    expect(fake.db.people).toHaveLength(2);
    expect(fake.db.customers.map((r: any) => r.id)).toEqual([id]);
  });

  it("库里没有这个人：新建一个人 + 身份，id 是同一个", async () => {
    const { claimCustomer } = await import("@/lib/accountClaim");
    const id = await claimCustomer("u3", "new@x.com");
    expect(fake.db.people).toEqual([expect.objectContaining({ id, email: "new@x.com", auth_user_id: "u3" })]);
    expect(fake.db.customers).toEqual([{ id }]);
    expect(fake.db.providers).toHaveLength(0);
  });
});

describe("createPerson", () => {
  it("**身份那步失败时把刚建的人撤掉**，不留一个什么身份都没有的人", async () => {
    fake.failNextWriteWith("撞了", "customers");
    const { createPerson } = await import("@/lib/people");
    await expect(createPerson("customer", { first_name: "小红" })).rejects.toThrow("撞了");
    expect(fake.db.people).toHaveLength(0);
    expect(fake.db.customers).toHaveLength(0);
  });
});

describe("查身份表时把人摊平带出来", () => {
  it("顶层：customers 那一行直接带上 first_name，形状跟合表之前一样", async () => {
    seed({
      people: [{ id: "p1", first_name: "阿明", chat_name: "aming", created_at: "人的时间" }],
      customers: [{ id: "p1", referred_by: null, created_at: "客户的时间" }],
    });
    const { PERSON_SPREAD } = await import("@/lib/people");
    const { data } = await fake.client.from("customers").select(`id, referred_by, ${PERSON_SPREAD}`);
    expect(data[0]).toMatchObject({ id: "p1", first_name: "阿明", chat_name: "aming" });
    // 人自己的 created_at 不会盖掉身份表的
    expect(data[0].created_at).toBe("客户的时间");
  });

  it("嵌套：orders → customers 里也摊平", async () => {
    seed({
      people: [{ id: "p1", first_name: "阿明" }],
      customers: [{ id: "p1" }],
      orders: [{ id: "o1", customer_id: "p1" }],
    });
    const { personSpread } = await import("@/lib/people");
    const { data } = await fake.client
      .from("orders")
      .select(`id, customers(${personSpread("first_name")})`);
    expect(data[0].customers).toMatchObject({ first_name: "阿明" });
  });
});
