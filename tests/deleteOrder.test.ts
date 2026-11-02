import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 删单 = 当它从没存在过（输错名字、选错身份）。跟着这一单凭空多出来的客人一起删，
// 但他身上只要还挂着别的东西就留着人。取消走改状态，不走这里。
//
// 假库不做外键 cascade：真库里删 people 会带走 customers / person_contacts，这里只看 people 那一行

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

let fake: ReturnType<typeof createFakeSupabase>;
function seed(tables = {}) {
  fake = createFakeSupabase({
    people: [{ id: "p1", chat_name: "输错的名字", auth_user_id: null }],
    customers: [{ id: "p1", referred_by: null }],
    providers: [],
    orders: [{ id: "o1", customer_id: "p1" }],
    person_contacts: [{ person_id: "p1", admin_id: "admin1" }],
    referral_payouts: [],
    ...tables,
  });
  (globalThis as any).__fakeSupabase = fake.client;
}

async function run(orderId = "o1") {
  const { deleteOrder } = await import("@/lib/deleteOrder");
  return deleteOrder(orderId);
}

const peopleIds = () => fake.db.people.map((p: any) => p.id);

beforeEach(() => {
  vi.resetModules();
  seed();
});

describe("删单顺带删掉凭空多出来的客人", () => {
  it("**新客人只有这一单：单和人一起删**", async () => {
    expect(await run()).toEqual({ removedPersonId: "p1" });
    expect(fake.db.orders).toHaveLength(0);
    expect(peopleIds()).toEqual([]);
  });

  it("还有别的单子：人留着", async () => {
    seed({ orders: [{ id: "o1", customer_id: "p1" }, { id: "o2", customer_id: "p1" }] });
    expect(await run()).toEqual({ removedPersonId: null });
    expect(fake.db.orders.map((o: any) => o.id)).toEqual(["o2"]);
    expect(peopleIds()).toEqual(["p1"]);
  });

  it("他也是物主：人留着", async () => {
    seed({ providers: [{ id: "p1" }] });
    await run();
    expect(peopleIds()).toEqual(["p1"]);
  });

  it("有人的介绍人是他：人留着", async () => {
    seed({
      people: [{ id: "p1" }, { id: "p2" }],
      customers: [{ id: "p1" }, { id: "p2", referred_by: "p1" }],
    });
    await run();
    expect(peopleIds()).toEqual(["p1", "p2"]);
  });

  it("他收过返点：人留着", async () => {
    seed({ referral_payouts: [{ order_id: "o9", referrer_id: "p1" }] });
    await run();
    expect(peopleIds()).toEqual(["p1"]);
  });

  it("他自己登录过：人留着", async () => {
    seed({ people: [{ id: "p1", auth_user_id: "u1" }] });
    await run();
    expect(peopleIds()).toEqual(["p1"]);
  });

  it("**查询出错就停：单删了，人留着**", async () => {
    fake.failReadsOn("providers");
    expect(await run()).toEqual({ removedPersonId: null });
    expect(fake.db.orders).toHaveLength(0);
    expect(peopleIds()).toEqual(["p1"]);
  });

  it("单子不存在：什么都不删", async () => {
    expect(await run("nope")).toEqual({ removedPersonId: null });
    expect(peopleIds()).toEqual(["p1"]);
  });
});
