// 内存版的 Supabase client，够跑 Route Handler 用到的那些链式调用。
//
// **为什么不连真库**：集成测试要在 GitHub Actions 上每次 PR 都跑，连真库意味着
// 要么把线上库的密钥放进 CI（测试会写坏真数据），要么在 CI 里起一整套 Supabase
// （慢，而且跟这些测试想验的东西无关）。这些测试要验的是**校验逻辑**——配多了、
// 配重了、日期盖不住、类型不对——这些全在服务端代码里，跟 Postgres 怎么存无关。
//
// 支持的链子就是 handler 里实际用到的那些，用到新的再往这儿加：
//   from(t).select(cols).eq().neq().in().is().ilike().overlaps() → 数组
//   ….single() / .maybeSingle()     → 单行
//   from(t).insert(row)            （也能接 .select("id").single() 拿回新行）
//   from(t).update(patch).eq() / .in()
//   from(t).delete().eq().eq()
//   from(t).upsert(row, { onConflict })
//   rpc(name, args)                 （只记进 writes，不跑函数）
//   failReadsOn(t)                  这张表的 select 之后一律返回 error
//
// select 里写成 "resources(id, holder_gender)" 的嵌套关系也认，一条 select 里可以有好几个：
//   · 这一行上有外键列的（order_assignments.resource_id → resources）：多对一，
//     返回 { resources: {...} }
//   · 反过来，别的表指着这一行的（orders ← order_assignments.order_id）：一对多，
//     按 <这张表去掉 s>_id 去找，返回 { order_assignments: [...] }
// 两种形状都跟 PostgREST 一致。
//
// 身份表（customers / providers）上的 `...people(…)` 也认（0017）：按同一个 id 去 people
// 里找到那个人，把他的字段摊平进这一行 —— 顶层的和嵌套里的都一样。

export type Tables = Record<string, any[]>;

/** 关联列怎么推：order_assignments.resources → resource_id */
const FK_COLUMN: Record<string, string> = {
  resources: "resource_id",
  orders: "order_id",
  customers: "customer_id",
  providers: "provider_id",
};

/** 一条筛选：eq / neq / in / is。存成谓词，加新的比较方式不用改调用处 */
type Filter = (row: any) => boolean;

function matches(row: any, filters: Filter[]) {
  return filters.every((f) => f(row));
}

/** customers / providers 的 id 就是 people.id，spread 时按 id 对上 */
const PERSON_ROLE_TABLES = new Set(["customers", "providers"]);
const wantsPersonSpread = (select: string) => select.includes("...people(");

/**
 * select 里**顶层**的嵌套关系：
 * 「id, customers(...people(x)), order_assignments(resource_id)」→ [customers, order_assignments]。
 * 嵌套里面的不算（customers 里的 people 是摊平，另说）；`...people(` 摊平不算；
 * `people!inner(` 这种只用来筛选的，按 people 算、下面会跳过
 */
function topLevelEmbeds(select: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let token = "";
  for (const ch of select) {
    if (ch === "(") {
      const name = token.trim();
      if (depth === 0 && name && !name.startsWith("...")) out.push(name.split("!")[0]);
      depth++;
      token = "";
    } else if (ch === ")") {
      depth--;
      token = "";
    } else if (ch === ",") {
      token = "";
    } else {
      token += ch;
    }
  }
  return out;
}

export function createFakeSupabase(seed: Tables = {}) {
  const db: Tables = {};
  for (const [k, v] of Object.entries(seed)) db[k] = v.map((r) => ({ ...r }));
  const table = (t: string) => (db[t] ??= []);

  /** 记下每一次写操作，测试里可以断言「到底有没有真写进去」 */
  const writes: { op: string; table: string; payload?: any }[] = [];
  /** 下一次写操作强制失败，用来测「库出错了 handler 怎么办」 */
  let failNextWrite: string | null = null;
  /** 这几张表的 select 一律返回 error（验「查询出错就停」那种分支） */
  const failingReads = new Set<string>();
  /** 只让这张表的下一次写失败（null = 哪张表都算）。测「第二步失败时第一步撤没撤」用 */
  let failTable: string | null = null;
  /** 这一次写该不该失败；该的话把失败用掉，返回错误信息 */
  const takeFailure = (t: string): string | null => {
    if (!failNextWrite || (failTable && failTable !== t)) return null;
    const message = failNextWrite;
    failNextWrite = null;
    failTable = null;
    return message;
  };

  function builder(t: string) {
    const filters: Filter[] = [];
    let select = "*";
    let mode: "select" | "delete" = "select";

    const rows = () => table(t).filter((r) => matches(r, filters));

    // 摊平时 people 自己的 id / created_at 不带进来 —— 真的 spread 也只取 select 里点名的列
    const withPerson = (row: any) => {
      if (!row) return row;
      const person = table("people").find((p) => p.id === row.id);
      if (!person) return row;
      const { id: _id, created_at: _c, ...fields } = person;
      return { ...fields, ...row };
    };

    const project = (row: any) => {
      const spread = wantsPersonSpread(select);
      const base = spread && PERSON_ROLE_TABLES.has(t) ? withPerson(row) : row;
      const out = { ...base };
      for (const embed of topLevelEmbeds(select)) {
        // people!inner(...) 只用来筛选（真库里是把 people 那边的条件带上），这里不挂出来
        if (embed === "people") continue;
        const fk = FK_COLUMN[embed];
        if (fk) {
          const linked = table(embed).find((x) => x.id === row[fk]) ?? null;
          out[embed] = spread && PERSON_ROLE_TABLES.has(embed) ? withPerson(linked) : linked;
        } else {
          // 一对多：orders 的 order_assignments = order_id 指着这一单的那几行
          const back = `${t.replace(/s$/, "")}_id`;
          out[embed] = table(embed).filter((x) => x[back] === row.id);
        }
      }
      return out;
    };

    const settle = () => {
      if (mode === "delete") {
        const doomed = new Set(rows());
        db[t] = table(t).filter((r) => !doomed.has(r));
        writes.push({ op: "delete", table: t, payload: filters });
        return { data: null, error: null };
      }
      if (failingReads.has(t)) return { data: null, error: { message: `读 ${t} 失败` } };
      return { data: rows().map(project), error: null };
    };

    const api: any = {
      select(cols?: string) {
        if (cols) select = cols;
        return api;
      },
      eq(col: string, val: any) {
        filters.push((row) => row[col] === val);
        return api;
      },
      neq(col: string, val: any) {
        filters.push((row) => row[col] !== val);
        return api;
      },
      in(col: string, vals: any[]) {
        const set = new Set(vals);
        filters.push((row) => set.has(row[col]));
        return api;
      },
      // 数组列跟给的值有没有交集（PostgREST 的 ov）。排期总览按季读订单用
      overlaps(col: string, vals: any[]) {
        const set = new Set(vals);
        filters.push((row) => Array.isArray(row[col]) && row[col].some((v: any) => set.has(v)));
        return api;
      },
      // 只做「不分大小写的整串相等」，不认 % 通配 —— 认领按邮箱、建单按名字，都是整串比
      ilike(col: string, val: string) {
        const want = String(val).toLowerCase();
        filters.push((row) => String(row[col] ?? "").toLowerCase() === want);
        return api;
      },
      // .or("a.ilike.\"%x%\",b.ilike.\"%x%\"")：只认全局搜索用的那种写法（lib/globalSearch.ts 的
      // orContains）—— 每段都是带双引号的 ilike，% 是通配，\ 转义。认不出来就抛，免得测试悄悄全绿
      or(expr: string) {
        const parts = [...expr.matchAll(/([a-z_]+)\.ilike\."((?:[^"\\]|\\.)*)"(?:,|$)/g)];
        if (!parts.length || parts.map((m) => m[0]).join("") !== expr) {
          throw new Error(`假库不认这条 or：${expr}`);
        }
        const tests = parts.map(([, col, quoted]) => {
          const pattern = quoted.replace(/\\(.)/g, "$1"); // 先去掉引号那层转义
          let re = "";
          for (let i = 0; i < pattern.length; i++) {
            const c = pattern[i];
            if (c === "\\") re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            else if (c === "%") re += ".*";
            else if (c === "_") re += ".";
            else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          }
          const rx = new RegExp(`^${re}$`, "is");
          return (row: any) => rx.test(String(row[col] ?? ""));
        });
        filters.push((row) => tests.some((t) => t(row)));
        return api;
      },
      // PostgREST 的 .is(col, null) 是 IS NULL。假库里「这个字段没有」和「是 null」
      // 是一回事（种子数据不会把每个可空列都写出来），所以用 == 不用 ===
      is(col: string, val: any) {
        filters.push((row) => (val === null ? row[col] == null : row[col] === val));
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      single() {
        const r = rows()[0];
        return Promise.resolve(
          r ? { data: project(r), error: null } : { data: null, error: { message: "没找到" } }
        );
      },
      maybeSingle() {
        if (failingReads.has(t)) return Promise.resolve({ data: null, error: { message: `读 ${t} 失败` } });
        const r = rows()[0];
        return Promise.resolve({ data: r ? project(r) : null, error: null });
      },
      // 既能直接 await，也能接 .select("id").single() 拿回新行（createPerson 要用）
      insert(payload: any) {
        let result: { data: any; error: any };
        const failure = takeFailure(t);
        if (failure) {
          result = { data: null, error: { message: failure } };
        } else {
          const list = Array.isArray(payload) ? payload : [payload];
          const created = list.map((row: any) => {
            const r = { id: `${t}-${table(t).length + 1}`, ...row };
            table(t).push(r);
            return r;
          });
          writes.push({ op: "insert", table: t, payload });
          result = { data: created, error: null };
        }
        const awaited = { data: null, error: result.error };
        const chain: any = {
          select: () => chain,
          single: () =>
            Promise.resolve(result.error ? result : { data: result.data[0], error: null }),
          then: (res: any, rej: any) => Promise.resolve(awaited).then(res, rej),
        };
        return chain;
      },
      update(patch: any) {
        const run = () => {
          const failure = takeFailure(t);
          if (failure) {
            return { data: null, error: { message: failure } };
          }
          for (const row of rows()) Object.assign(row, patch);
          writes.push({ op: "update", table: t, payload: patch });
          return { data: null, error: null };
        };
        const chain: any = {
          eq(col: string, val: any) {
            filters.push((row) => row[col] === val);
            return chain;
          },
          is(col: string, val: any) {
            filters.push((row) => (val === null ? row[col] == null : row[col] === val));
            return chain;
          },
          in(col: string, vals: any[]) {
            filters.push((row) => vals.includes(row[col]));
            return chain;
          },
          then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
        };
        return chain;
      },
      // onConflict 可以是多列（"person_id,admin_id"），每一列都相等才算撞上。
      // ignoreDuplicates：撞上了就什么都不做（PostgREST 的 on conflict do nothing）
      upsert(payload: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        const failure = takeFailure(t);
        if (failure) {
          return Promise.resolve({ data: null, error: { message: failure } });
        }
        const keys = (opts?.onConflict ?? "id").split(",").map((k) => k.trim());
        const existing = table(t).find((r) => keys.every((k) => r[k] === payload[k]));
        if (existing) {
          if (!opts?.ignoreDuplicates) Object.assign(existing, payload);
        } else table(t).push({ ...payload });
        writes.push({ op: "upsert", table: t, payload });
        return Promise.resolve({ data: null, error: null });
      },
      delete() {
        mode = "delete";
        return api;
      },
      then: (res: any, rej: any) => Promise.resolve(settle()).then(res, rej),
    };
    return api;
  }

  return {
    client: {
      from: (t: string) => builder(t),
      // 库函数（merge_person 这种）只记下调了谁、传了什么，不模拟函数本身 —— 那是 SQL 的事
      rpc: async (name: string, args: any) => {
        const message = takeFailure(name);
        writes.push({ op: "rpc", table: name, payload: args });
        return { data: null, error: message ? { message } : null };
      },
    },
    db,
    writes,
    failReadsOn(t: string) {
      failingReads.add(t);
    },
    failNextWriteWith(message: string, onTable?: string) {
      failNextWrite = message;
      failTable = onTable ?? null;
    },
  };
}
