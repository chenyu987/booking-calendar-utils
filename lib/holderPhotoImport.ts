// 从老的排期表（Google Sheet）把持有人照片导进来：scripts/import-holder-photos.mjs 用。
//
// **只给库里已经有的资源配照片。** 表里有、库里没有的行直接跳过 —— 不建资源，也不当成问题列出来
// （那些多半是以前季的资源，现在不在了）。
//
// 怎么认是同一个资源：**名字 + 生日**都对上。只对名字会撞（表里就有同名的），
// 只对生日更会撞（同一天生的好几对）。名字比较不分大小写、不管多余空格。
// 两个资源名字生日完全一样的，分不出来，不猜，列出来让人手动传。
//
// 这个文件 node 直接 import（scripts/ 里的 .mjs，Node 24 自带去类型），
// 所以只写能直接去掉的类型注解、不 import 别的文件。

export type SheetRow = { row: number; name?: string | null; dob?: string | null; url?: string | null };
export type ResourceForImport = {
  id: string;
  holder_name: string | null;
  holder_date_of_birth: string | null;
  holder_photo_path: string | null;
};

export type ImportPlan = {
  /** 要导的：哪个资源、用表里哪一行的图 */
  toImport: { resourceId: string; name: string; dob: string; row: number; url: string }[];
  /** 表里能对上、但资源上已经有照片了（没加 --overwrite 就不动） */
  alreadyHave: number;
  /** 表里有图、库里找不到这个资源 —— 跳过 */
  notInDb: number;
  /** 库里有两张以上名字生日完全一样的资源，分不出该给哪张 */
  ambiguous: { name: string; dob: string; resourceIds: string[] }[];
  /** 库里的资源，表里找不到照片的有几张（导完还要手动补的） */
  dbWithoutPhoto: number;
};

export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** 表里的生日是 "7/7/1998"（月/日/年）；也认 "1998-07-07"。认不出来返回 null */
export function parseSheetDate(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  let y: number, m: number, d: number;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // 2/30 这种 Date 会自己滚到 3 月，滚了就是填错了
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function planImport(rows: SheetRow[], resources: ResourceForImport[], opts: { overwrite?: boolean } = {}): ImportPlan {
  const keyOf = (name: string | null | undefined, dob: string | null | undefined) =>
    `${normalizeName(name)}|${dob ?? ""}`;

  const byKey = new Map<string, ResourceForImport[]>();
  for (const s of resources) {
    if (!normalizeName(s.holder_name) || !s.holder_date_of_birth) continue;
    const k = keyOf(s.holder_name, s.holder_date_of_birth);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }

  const plan: ImportPlan = { toImport: [], alreadyHave: 0, notInDb: 0, ambiguous: [], dbWithoutPhoto: 0 };
  const seen = new Set<string>();
  const matched = new Set<string>();

  for (const r of rows) {
    const dob = parseSheetDate(r.dob);
    if (!r.url || !normalizeName(r.name) || !dob) continue;
    const k = keyOf(r.name, dob);
    // 同一个人在表里出现好几行：用第一行有图的那张，后面的不再算
    if (seen.has(k)) continue;
    seen.add(k);

    const hits = byKey.get(k) ?? [];
    if (hits.length === 0) {
      plan.notInDb++;
      continue;
    }
    hits.forEach((s) => matched.add(s.id));
    if (hits.length > 1) {
      plan.ambiguous.push({ name: r.name!.trim(), dob, resourceIds: hits.map((s) => s.id) });
      continue;
    }
    const s = hits[0];
    if (s.holder_photo_path && !opts.overwrite) {
      plan.alreadyHave++;
      continue;
    }
    plan.toImport.push({ resourceId: s.id, name: r.name!.trim(), dob, row: r.row, url: r.url });
  }

  plan.dbWithoutPhoto = resources.filter((s) => !s.holder_photo_path && !matched.has(s.id)).length;
  return plan;
}
