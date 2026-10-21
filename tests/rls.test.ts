import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// RLS（0026）：一条策略都不写 = anon key 什么都碰不到。前提是**每张表都开了**——
// 漏一张，那张表对任何从浏览器里抄走 anon key 的人都是敞开的，而页面上一切正常，没人会发现。
const tablesIn = (sql: string) =>
  [...sql.matchAll(/^create table (?:if not exists )?(\w+)/gm)].map((m) => m[1]);
const rlsIn = (sql: string) =>
  new Set([...sql.matchAll(/^alter table (\w+) enable row level security;/gm)].map((m) => m[1]));

describe("RLS", () => {
  it("**0001_init.sql 里每张表都开了 RLS** —— 新建表漏了这一行，那张表对 anon key 敞开", () => {
    const sql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    const tables = tablesIn(sql);
    expect(tables.length).toBeGreaterThan(10);
    const enabled = rlsIn(sql);
    expect(tables.filter((t) => !enabled.has(t))).toEqual([]);
  });

  it("增量迁移里新建的表也开了（同一个迁移文件里或者之后的某个文件里）", () => {
    const files = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f !== "0001_init.sql")
      .sort();
    // 0026 之前建的表由 0026 一起打开；之后新建的表得在它自己那条或更后面的迁移里打开
    const enabled = new Set<string>();
    for (const f of files) rlsIn(readFileSync(`supabase/migrations/${f}`, "utf8")).forEach((t) => enabled.add(t));
    const created = files.flatMap((f) => tablesIn(readFileSync(`supabase/migrations/${f}`, "utf8")));
    expect(created.filter((t) => !enabled.has(t))).toEqual([]);
  });

  it("security definer 函数都收回了 anon / authenticated 的执行权限 —— 不收的话没登录也能经 /rest/v1/rpc 调到", () => {
    const sql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
    const definers = [...sql.matchAll(/^create (?:or replace )?function (\w+)\(([^)]*)\)[^;]*?security definer/gm)].map(
      (m) => `${m[1]}(${m[2]})`,
    );
    expect(definers.length).toBeGreaterThan(0);
    const revoked = new Set(
      [...sql.matchAll(/^revoke execute on function (\w+\([^)]*\)) from public, anon, authenticated;/gm)].map((m) => m[1]),
    );
    expect(definers.filter((f) => !revoked.has(f))).toEqual([]);
  });
});
