// 资源的有效期：**一组互不重叠的日期段**（迁移 `0023`，`resources.validity datemultirange`）。
//
// 为什么不是一对 start/end：一个资源可能 24/25 季能用、25/26 季没续、26/27 又续上了，
// 一对起止表达不了中间那段空着。存成 Postgres 的 `datemultirange`：
//   · 本来就是「一组区间」的类型，库会自己排序、把挨着/重叠的段合成一段，存不进乱数据
//   · 每一段的两头照样可以不设限 —— 「留空 = 这一头不设限」的老约定原样保留
//   · 库里加了 check：不许是空集合。「哪天都不能用」的资源该改挂牌状态，不该靠有效期
//
// PostgREST 读出来是一串文本（`{[2025-11-01,2026-05-31),[2026-11-01,2027-05-31)}`），
// 写进去也是文本。**解析和拼装只在这一个文件里**，别的地方一律拿 `Period[]`。

/** 一段有效期。两头都是**含当天**的 ISO 日期，null = 这一头不设限 */
export type Period = { start: string | null; end: string | null };

/** 不设限：一段两头都空 */
export const OPEN_VALIDITY: Period[] = [{ start: null, end: null }];

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * 把库里读出来的 multirange 文本解析成 `Period[]`（按开始日排好，不设下限的在最前）。
 *
 * Postgres 会把 daterange 规整成「左闭右开」：含当天的结束日 5/30 存出来是 `5/31)`。
 * 这里统一换回**含当天**的写法，界面和比较都按含当天来。
 * `null` / `undefined`（列还没读出来、测试里没给）当成不设限 —— 跟老的两列都空一个意思。
 */
export function parseValidity(raw: unknown): Period[] {
  if (Array.isArray(raw)) return raw as Period[]; // 已经是解析好的（测试 / 内存假库）
  if (raw == null) return OPEN_VALIDITY;
  const text = String(raw).trim();
  const periods: Period[] = [];
  const re = /([[(])\s*"?([^,"\])]*)"?\s*,\s*"?([^,"\])]*)"?\s*([\])])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, lo, a, b, hi] = m;
    const start = a && a !== "-infinity" ? (lo === "(" ? shiftDay(a, 1) : a) : null;
    const end = b && b !== "infinity" ? (hi === ")" ? shiftDay(b, -1) : b) : null;
    periods.push({ start, end });
  }
  return periods;
}

/** 拼成能写进 `validity` 列的文本。每段写成两头都含当天的 `[a,b]`，库会自己规整 */
export function serializeValidity(periods: Period[]): string {
  const parts = periods.map(
    (p) => `${p.start ? `[${p.start}` : "("},${p.end ? `${p.end}]` : ")"}`
  );
  return `{${parts.join(",")}}`;
}

/** 一个资源的有效期。读的是 `validity` 列 */
export function resourcePeriods(resource: any): Period[] {
  return parseValidity(resource?.validity);
}

/** 这一天在不在某一段里 */
export function dayInPeriods(periods: Period[], day: string): boolean {
  return periods.some((p) => (!p.start || day >= p.start) && (!p.end || day <= p.end));
}

/**
 * 最早开始到最晚结束的整个跨度（中间的空档不管）。
 * 给「按有效期筛」「按开始生效排序」这种只关心两头的地方用。
 */
export function validitySpan(periods: Period[]): Period {
  if (periods.length === 0) return { start: null, end: null };
  const starts = periods.map((p) => p.start);
  const ends = periods.map((p) => p.end);
  return {
    start: starts.includes(null) ? null : (starts as string[]).sort()[0],
    end: ends.includes(null) ? null : (ends as string[]).sort().at(-1)!,
  };
}

export type ValidityFormError = "dates";

/**
 * 表单上的有效期 → `Period[]`。表单里每段一对 `date_range_start` / `date_range_end`
 * 输入框（`formData.getAll` 拿到的是两个等长的数组）。
 *
 * - 一对两头都空：这一对**没填**，跳过 —— 除非所有对都空，那就是「不限」
 * - 结束早于开始：报错
 */
export function periodsFromForm(
  starts: string[],
  ends: string[]
): Period[] | ValidityFormError {
  const periods: Period[] = [];
  const n = Math.max(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const start = (starts[i] ?? "").trim() || null;
    const end = (ends[i] ?? "").trim() || null;
    if (!start && !end) continue;
    if (start && end && end < start) return "dates";
    periods.push({ start, end });
  }
  return periods.length > 0 ? periods : OPEN_VALIDITY;
}

/** 从 FormData 读，字段名跟老的两列一样 */
export function periodsFromFormData(
  formData: FormData,
  startName = "date_range_start",
  endName = "date_range_end"
): Period[] | ValidityFormError {
  const all = (name: string) => formData.getAll(name).map((v) => String(v ?? ""));
  return periodsFromForm(all(startName), all(endName));
}

/**
 * 按「什么时候开始生效」排，跟原来库里 `.order("date_range_start")` 同一个顺序：
 * 不设下限的沉底（Postgres 升序默认 NULLS LAST）。multirange 在库里排的话
 * 不设下限的会排最前，顺序就变了，所以在内存里排
 */
export function compareByValidityStart(a: any, b: any): number {
  const x = validitySpan(resourcePeriods(a)).start;
  const y = validitySpan(resourcePeriods(b)).start;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? -1 : 1;
}
