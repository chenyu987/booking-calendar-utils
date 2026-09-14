// 内存版的 Supabase client，够跑 Route Handler 用到的那些链式调用。
//
// **为什么不连真库**：集成测试要在 GitHub Actions 上每次 PR 都跑，连真库意味着
// 要么把线上库的密钥放进 CI（测试会写坏真数据），要么在 CI 里起一整套 Supabase
// （慢，而且跟这些测试想验的东西无关）。这些测试要验的是**校验逻辑**——配多了、
// 配重了、日期盖不住、类型不对——这些全在服务端代码里，跟 Postgres 怎么存无关。
//
// 支持的链子就是 handler 里实际用到的那些，用到新的再往这儿加：
//   from(t).select(cols).eq().neq().in().is() → 数组
//   ….single() / .maybeSingle()     → 单行
//   from(t).insert(row)
//   from(t).update(patch).eq()
//   from(t).delete().eq().eq()
//   from(t).upsert(row, { onConflict })
//
// select 里写成 "resources(id, holder_gender)" 的嵌套关系也认：按
// <表名去掉 s>_id 去对应的表里找，返回 { resources: {...} } 这种形状，
// 跟 PostgREST 一致。

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

function embedName(select: string): string | null {
  const m = select.match(/([a-z_]+)\s*\(/);
  return m ? m[1] : null;
}

export function createFakeSupabase(seed: Tables = {}) {
  const db: Tables = {};
  for (const [k, v] of Object.entries(seed)) db[k] = v.map((r) => ({ ...r }));
  const table = (t: string) => (db[t] ??= []);

  /** 记下每一次写操作，测试里可以断言「到底有没有真写进去」 */
  const writes: { op: string; table: string; payload?: any }[] = [];
  /** 下一次写操作强制失败，用来测「库出错了 handler 怎么办」 */
  let failNextWrite: string | null = null;

  function builder(t: string) {
    const filters: Filter[] = [];
    let select = "*";
    let mode: "select" | "delete" = "select";

    const rows = () => table(t).filter((r) => matches(r, filters));

    const project = (row: any) => {
      const embed = embedName(select);
      if (!embed) return row;
      const fk = FK_COLUMN[embed];
      const linked = fk ? table(embed).find((x) => x.id === row[fk]) ?? null : null;
      return { ...row, [embed]: linked };
    };

    const settle = () => {
      if (mode === "delete") {
        const doomed = new Set(rows());
        db[t] = table(t).filter((r) => !doomed.has(r));
        writes.push({ op: "delete", table: t, payload: filters });
        return { data: null, error: null };
      }
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
        const r = rows()[0];
        return Promise.resolve({ data: r ? project(r) : null, error: null });
      },
      insert(payload: any) {
        if (failNextWrite) {
          const message = failNextWrite;
          failNextWrite = null;
          return Promise.resolve({ data: null, error: { message } });
        }
        const list = Array.isArray(payload) ? payload : [payload];
        for (const row of list) table(t).push({ id: `${t}-${table(t).length + 1}`, ...row });
        writes.push({ op: "insert", table: t, payload });
        return Promise.resolve({ data: null, error: null });
      },
      update(patch: any) {
        const run = () => {
          if (failNextWrite) {
            const message = failNextWrite;
            failNextWrite = null;
            return { data: null, error: { message } };
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
          then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
        };
        return chain;
      },
      upsert(payload: any, opts?: { onConflict?: string }) {
        if (failNextWrite) {
          const message = failNextWrite;
          failNextWrite = null;
          return Promise.resolve({ data: null, error: { message } });
        }
        const key = opts?.onConflict ?? "id";
        const existing = table(t).find((r) => r[key] === payload[key]);
        if (existing) Object.assign(existing, payload);
        else table(t).push({ ...payload });
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
    client: { from: (t: string) => builder(t) },
    db,
    writes,
    failNextWriteWith(message: string) {
      failNextWrite = message;
    },
  };
}
