
export type ItemType = "beta" | "alpha";

export type Region =
  | "regionA"
  | "regionB"
  | "regionC"
  | "regionD"
  | "regionE"
  | "regionF"
  | "regionG"
  | "regionH"
  | "regionI"
  | "regionJ";

/** label 只用来显示：输入框的补全列表里让人认得出这是哪个地点。匹配一律看 canonical */
export type Venue = { canonical: string; region: Region; label: string; item: ItemType };
type VenueEntry = Omit<Venue, "item">;

export const REGION_LABELS: Record<Region, string> = {
  regionA: "区域 A",
  regionB: "区域 B",
  regionC: "区域 C",
  regionD: "区域 D",
  regionE: "区域 E",
  regionF: "区域 F",
  regionG: "区域 G",
  regionH: "区域 H",
  regionI: "区域 I",
  regionJ: "区域 J",
};

const ALPHA: VenueEntry[] = [
  { canonical: "locaa", region: "regionA", label: "地点 01" },
  { canonical: "locab", region: "regionA", label: "地点 02" },
  { canonical: "locac", region: "regionA", label: "地点 03" },
  { canonical: "locad", region: "regionA", label: "地点 04" },
  { canonical: "locae", region: "regionA", label: "地点 05" },
  { canonical: "locaf", region: "regionA", label: "地点 06" },

  { canonical: "locag", region: "regionB", label: "地点 07" },
  { canonical: "ns", region: "regionB", label: "地点 08" },
  { canonical: "locai", region: "regionB", label: "地点 09" },

  { canonical: "locaj", region: "regionD", label: "地点 10" },
  { canonical: "locak", region: "regionD", label: "地点 11" },

  { canonical: "local", region: "regionF", label: "地点 12" },
  { canonical: "locam", region: "regionF", label: "地点 13" },
  { canonical: "locan", region: "regionF", label: "地点 14" },
  { canonical: "locao", region: "regionF", label: "地点 15" },
  { canonical: "locap", region: "regionF", label: "地点 16" },
  { canonical: "locaq", region: "regionF", label: "地点 17" },
  { canonical: "locar", region: "regionF", label: "地点 18" },

  { canonical: "hunter", region: "regionH", label: "地点 19" },
  { canonical: "liberty", region: "regionH", label: "地点 20" },
  { canonical: "locau", region: "regionH", label: "地点 21" },
  { canonical: "locav", region: "regionH", label: "地点 22" },
  { canonical: "locaw", region: "regionH", label: "地点 23" },
  { canonical: "locax", region: "regionH", label: "地点 24" },
  { canonical: "locay", region: "regionH", label: "地点 25" },
  { canonical: "locaz", region: "regionH", label: "地点 26" },
  { canonical: "locba", region: "regionH", label: "地点 27" },

  { canonical: "locbb", region: "regionI", label: "地点 28" },
  { canonical: "locbc", region: "regionI", label: "地点 29" },
  { canonical: "locbd", region: "regionI", label: "地点 30" },
  { canonical: "locbe", region: "regionI", label: "地点 31" },
  { canonical: "locbf", region: "regionI", label: "地点 32" },
  { canonical: "locbg", region: "regionI", label: "地点 33" },
  { canonical: "locbh", region: "regionI", label: "地点 34" },
  { canonical: "locbi", region: "regionI", label: "地点 35" },
  { canonical: "locbj", region: "regionI", label: "地点 36" },
  { canonical: "locbk", region: "regionI", label: "地点 37" },

  { canonical: "locbl", region: "regionJ", label: "地点 38" },
  { canonical: "locbm", region: "regionJ", label: "地点 39" },
  { canonical: "locbn", region: "regionJ", label: "地点 40" },
];

const BETA: VenueEntry[] = [
  { canonical: "locbo", region: "regionA", label: "地点 41" },
  { canonical: "locbp", region: "regionA", label: "地点 42" },
  { canonical: "copper", region: "regionA", label: "地点 43" },
  { canonical: "locbr", region: "regionA", label: "地点 44" },
  { canonical: "locbs", region: "regionA", label: "地点 45" },
  { canonical: "locbt", region: "regionA", label: "地点 46" },
  { canonical: "locbu", region: "regionA", label: "地点 47" },
  { canonical: "locbv", region: "regionA", label: "地点 48" },
  { canonical: "locbw", region: "regionA", label: "地点 49" },
  { canonical: "locbx", region: "regionA", label: "地点 50" },
  { canonical: "locby", region: "regionA", label: "地点 51" },
  { canonical: "locbz", region: "regionA", label: "地点 52" },
  { canonical: "locca", region: "regionA", label: "地点 53" },
  { canonical: "loccb", region: "regionA", label: "地点 54" },
  { canonical: "loccc", region: "regionA", label: "地点 55" },
  { canonical: "loccd", region: "regionA", label: "地点 56" },

  { canonical: "locce", region: "regionB", label: "地点 57" },
  { canonical: "sierra", region: "regionB", label: "地点 58" },

  { canonical: "loccg", region: "regionC", label: "地点 59" },
  { canonical: "locch", region: "regionC", label: "地点 60" },
  { canonical: "locci", region: "regionC", label: "地点 61" },
  { canonical: "loccj", region: "regionC", label: "地点 62" },

  { canonical: "crystal", region: "regionD", label: "地点 63" },
  { canonical: "loccl", region: "regionD", label: "地点 64" },
  { canonical: "loccm", region: "regionD", label: "地点 65" },
  { canonical: "loccn", region: "regionD", label: "地点 66" },
  { canonical: "locco", region: "regionD", label: "地点 67" },
  { canonical: "loccp", region: "regionD", label: "地点 68" },

  { canonical: "loccq", region: "regionE", label: "地点 69" },
  { canonical: "loccr", region: "regionE", label: "地点 70" },
  { canonical: "loccs", region: "regionE", label: "地点 71" },
  { canonical: "red", region: "regionE", label: "地点 72" },
  { canonical: "loccu", region: "regionE", label: "地点 73" },
  { canonical: "loccv", region: "regionE", label: "地点 74" },

  { canonical: "loccw", region: "regionF", label: "地点 75" },
  { canonical: "loccx", region: "regionF", label: "地点 76" },
  { canonical: "loccy", region: "regionF", label: "地点 77" },
  { canonical: "loon", region: "regionF", label: "地点 78" },
  { canonical: "locda", region: "regionF", label: "地点 79" },
  { canonical: "locdb", region: "regionF", label: "地点 80" },

  { canonical: "locdc", region: "regionG", label: "地点 81" },
  { canonical: "locdd", region: "regionG", label: "地点 82" },

  { canonical: "locde", region: "regionH", label: "地点 83" },
  { canonical: "akacp", region: "regionH", label: "地点 84" },
  { canonical: "locdg", region: "regionH", label: "地点 85" },

  { canonical: "locdh", region: "regionI", label: "地点 86" },
  { canonical: "highlands", region: "regionI", label: "地点 87" },
  { canonical: "locdj", region: "regionI", label: "地点 88" },
  { canonical: "locdk", region: "regionI", label: "地点 89" },
  { canonical: "locdl", region: "regionI", label: "地点 90" },

  { canonical: "locdm", region: "regionJ", label: "地点 91" },
  { canonical: "locdn", region: "regionJ", label: "地点 92" },
];

const VENUES: Venue[] = [
  ...ALPHA.map((r) => ({ ...r, item: "alpha" as const })),
  ...BETA.map((r) => ({ ...r, item: "beta" as const })),
];

const ALIASES: Record<string, string> = {
  akaaa: "ns",
  akaab: "locac",
  akaac: "locac",
  akaad: "locaj",
  akaae: "locaj",
  akaaf: "locan",
  snow: "locan",
  akaah: "locbm",
  akaai: "locbb",
  akaaj: "locay",
  akaak: "locbc",
  akaal: "locbc",
  akaam: "locbw",
  locbh: "locbh",
  akaao: "locbe",
  akaap: "locbj",
  akaaq: "locbk",
  akaar: "locaf",
  akaas: "locag",
  akaat: "locao",
  akaau: "locae",

  akaav: "locbo",
  akaaw: "locbo",
  akaax: "locbp",
  akaay: "locbp",
  akaaz: "locbp",
  akaba: "locbp",
  akabb: "locbr",
  akabc: "locbs",
  akabd: "locbu",
  akabe: "locbx",
  dv: "locby",
  jordan: "locca",
  jh: "locca",
  akabi: "locca",
  akabj: "loccb",
  akabk: "loccd",
  akabl: "locce",
  akabm: "locce",
  akabn: "locce",
  akabo: "locce",
  akabp: "sierra",
  locci: "locci",
  akabr: "locci",
  akabs: "locci",
  locck: "crystal",
  akabu: "loccl",
  akabv: "loccl",
  akabw: "loccm",
  akabx: "loccm",
  akaby: "loccq",
  akabz: "loccq",
  sunshine: "loccq",
  akacb: "loccq",
  akacc: "loccq",
  louise: "loccq",
  akace: "loccq",
  akacf: "loccq",
  akacg: "loccr",
  akach: "loccr",
  akaci: "loccu",
  akacj: "loccw",
  akack: "loccw",
  akacl: "locdc",
  akacm: "locdc",
  akacn: "locdd",
  massif: "locdd",
  blue: "akacp",
  akacq: "akacp",
  akacr: "akacp",
  akacs: "akacp",
  locct: "red",
  akacu: "highlands",
  akacv: "highlands",
  akacw: "locdj",
  akacx: "locdk",
  akacy: "locdn",
  akacz: "locdn",
};

const BY_CANONICAL = new Map(VENUES.map((r) => [r.canonical, r]));

/**
 * 重名到必须带限定词才说得清的。**故意不给默认值** —— 猜一个就等于把
 * 「看得见的含糊」变成「看不见的错数据」。界面上会标红并列出可选项。
 */
const AMBIGUOUS: Record<string, string[]> = {
  hiddenvalley: ["locba", "locbi"],
  brighton: ["locbc", "locbw"],
};

function key(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s._\-'’,，、]/g, "")
    .replace(/[0-9]+$/, "")
    .replace(/(venue|location)$/, "");
}

function lookup(k: string): Venue | null {
  if (!k) return null;
  return BY_CANONICAL.get(k) ?? BY_CANONICAL.get(ALIASES[k] ?? "") ?? null;
}

/** 一条需求可能写「locad/locac」这种多个地点，取第一个认得的 */
export function normalizeLocation(raw?: string | null): Venue | null {
  if (!raw) return null;
  const whole = lookup(key(raw));
  if (whole) return whole;
  for (const part of raw.split(/[\/、,，+&]| and /i)) {
    const hit = lookup(key(part));
    if (hit) return hit;
  }
  return null;
}

/**
 * 这个地点名是不是「重名到说不清哪个」。是的话返回可选项，界面上照着提示。
 * 跟 suggestLocation 分开：那个是猜拼错，这个是知道你写的是哪几个之一但不知道是哪个。
 */
export function ambiguousLocation(raw?: string | null): string[] | null {
  if (!raw) return null;
  const candidates = AMBIGUOUS[key(raw)];
  return candidates ? [...candidates] : null;
}

/** 填了地点名但库里认不出来 —— 界面上要标红的就是这种 */
export function isUnknownLocation(raw?: string | null): boolean {
  if (!raw || !raw.trim()) return false;
  return normalizeLocation(raw) === null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * 猜他想写哪个地点。**只提示，不自动改** —— 自动改一旦猜错，
 * 错的地方从「看得见的错名字」变成「看不见的错数据」，那比现在糟得多。
 */
export function suggestLocation(raw?: string | null): string | null {
  const k = key(raw ?? "");
  if (k.length < 3) return null;
  const names = [...BY_CANONICAL.keys(), ...Object.keys(ALIASES)];
  let best: { name: string; d: number } | null = null;
  for (const name of names) {
    const d = editDistance(k, name);
    if (!best || d < best.d) best = { name, d };
  }
  if (!best || best.d > Math.max(2, Math.floor(k.length / 3))) return null;
  const venue = lookup(best.name);
  return venue ? venue.canonical : null;
}

/** 地点名认不出来时给的一句话：歧义就列出可选项，拼错就猜一个，都不是就直说 */
export function locationHintFor(raw: string): string {
  const options = ambiguousLocation(raw);
  if (options) {
    return `「${raw}」有两个同名场地，写清楚是哪个：${options.join(" / ")}`;
  }
  const guess = suggestLocation(raw);
  return guess
    ? `「${raw}」库里没有这个地点名，是不是想写「${guess}」？改对了才能参与推荐分配`
    : `「${raw}」库里没有这个地点名，可能写错了 —— 改对了才能参与推荐分配`;
}

/** 这个地点要什么资源，读场地自己标的 item；认不出来返回 null */
export function requiredItem(location?: string | null): ItemType | null {
  return normalizeLocation(location)?.item ?? null;
}

export function sameVenue(a?: string | null, b?: string | null): boolean {
  const ra = normalizeLocation(a);
  const rb = normalizeLocation(b);
  return !!ra && !!rb && ra.canonical === rb.canonical;
}

export function sameRegion(a?: string | null, b?: string | null): boolean {
  const ra = normalizeLocation(a);
  const rb = normalizeLocation(b);
  return !!ra && !!rb && ra.region === rb.region && ra.canonical !== rb.canonical;
}

/**
 * 这个资源的类型进不进得去这个地点：按场地自己标的 item 比。
 * 地点认不得、或类型没填 = null（不知道，不等于不匹配）。
 */
export function itemFits(
  location: string | null | undefined,
  itemType: string | null | undefined
): boolean | null {
  const need = requiredItem(location);
  if (!need) return null;
  if (itemType !== "beta" && itemType !== "alpha") return null;
  return itemType === need;
}

/** 输入框补全用的选项：值是库里的写法，旁边显示全称和区域 */
export const LOCATION_OPTIONS: {
  value: string;
  label: string;
  region: Region;
  item: ItemType;
  hint: string;
}[] = VENUES.map((r) => ({
  value: r.canonical,
  label: r.label,
  region: r.region,
  item: r.item,
  hint: `${r.label} · ${REGION_LABELS[r.region]} · ${r.item === "beta" ? "Beta" : "Alpha"}`,
})).sort((a, b) => a.value.localeCompare(b.value));

/**
 * 按地点 / 区域筛一条订单。**唯一出处** —— 排期总览和物主那边用的是同一套判断。
 *
 * 两个都给的时候以**具体地点**为准：选了 locaa 又选了 regionB，他要的显然是 locaa。
 * 两个都没给就全放过。
 *
 * 地点名认不出来的（库里没有、写错了）在选了筛选时会被筛掉 —— 这跟
 * `itemConflictReason` 那条「判断不了就不拦」不冲突：那条管的是**拦不拦人干活**，
 * 这条只是「你要看哪些」，看不到还能把筛选清掉。
 */
export function matchesLocationFilter(
  location: string | null | undefined,
  filter: { region?: string | null; mtn?: string | null }
): boolean {
  if (filter.mtn) return sameVenue(location, filter.mtn);
  if (filter.region) return normalizeLocation(location)?.region === filter.region;
  return true;
}
