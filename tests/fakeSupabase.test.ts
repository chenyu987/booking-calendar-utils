import { describe, expect, it } from "vitest";
import { createFakeSupabase, loadSchemaColumns } from "./fakeSupabase";

// 假库自己的测试：它得像真库一样拒绝表上没有的列，不然「多塞了一个字段」这类 bug 在集成测试里永远是绿的
// （需求页加群把 { ok: true, … } 整个插进 chat_groups，就是这么漏过去的）。

describe("假库按 0001_init.sql 认列", () => {
  it("读得到建表文件，认得出列、不把约束行当列", () => {
    const schema = loadSchemaColumns();
    expect(schema).not.toBeNull();
    expect([...schema!.get("chat_groups")!].sort()).toEqual(["active", "created_at", "id", "name", "note"]);
    expect(schema!.get("customers")!.has("constraint")).toBe(false);
    expect(schema!.get("person_contacts")!.has("primary")).toBe(false);
  });

  it("insert / update / upsert 里有表上没有的列就报错，一行都不写", async () => {
    const fake = createFakeSupabase({ chat_groups: [{ id: "g1", name: "A", active: true, note: null }] });
    const db = fake.client;

    const ins = await db.from("chat_groups").insert({ ok: true, name: "B", active: true, note: null });
    expect(ins.error?.message).toMatch(/'ok' column of 'chat_groups'/);
    const upd = await db.from("chat_groups").update({ ok: true, name: "C" }).eq("id", "g1");
    expect(upd.error?.message).toMatch(/'ok' column/);
    const ups = await db.from("chat_groups").upsert({ id: "g1", ok: true });
    expect(ups.error?.message).toMatch(/'ok' column/);

    expect(fake.db.chat_groups).toEqual([{ id: "g1", name: "A", active: true, note: null }]);
    expect(fake.writes).toHaveLength(0);
  });

  it("列都对的照常写", async () => {
    const fake = createFakeSupabase();
    const { error } = await fake.client.from("chat_groups").insert({ name: "B", active: true, note: null });
    expect(error).toBeNull();
    expect(fake.db.chat_groups).toHaveLength(1);
  });
});
