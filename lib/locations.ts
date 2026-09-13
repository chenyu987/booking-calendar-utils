
export type ItemType = "beta" | "alpha";

export type Region =
  | "regionA"
  | "regionB"
  | "regionC"
  | "regionD"
  | "regionE"
  | "regionF"
  | "regionG";

/** label 只用来显示：输入框的补全列表里让人认得出这是哪个地点。匹配一律看 canonical */
export type Venue = { canonical: string; region: Region; label: string };

export const REGION_LABELS: Record<Region, string> = {
  regionA: "区域 A",
  regionB: "区域 B",
  regionC: "区域 C",
  regionD: "区域 D",
  regionE: "区域 E",
  regionF: "区域 F",
  regionG: "区域 G",
};

const VENUES: Venue[] = [
  { canonical: "locaa", region: "regionA", label: "地点 01" },
  { canonical: "locab", region: "regionA", label: "地点 02" },
  { canonical: "locac", region: "regionA", label: "地点 03" },
  { canonical: "locad", region: "regionA", label: "地点 04" },
  { canonical: "locae", region: "regionA", label: "地点 05" },
  { canonical: "locaf", region: "regionA", label: "地点 06" },

  { canonical: "locag", region: "regionB", label: "地点 07" },
  { canonical: "ns", region: "regionB", label: "地点 08" },
  { canonical: "locai", region: "regionB", label: "地点 09" },

  { canonical: "locaj", region: "regionC", label: "地点 10" },
  { canonical: "locak", region: "regionC", label: "地点 11" },

  { canonical: "local", region: "regionD", label: "地点 12" },
  { canonical: "locam", region: "regionD", label: "地点 13" },
  { canonical: "locan", region: "regionD", label: "地点 14" },
  { canonical: "locao", region: "regionD", label: "地点 15" },
  { canonical: "locap", region: "regionD", label: "地点 16" },
  { canonical: "locaq", region: "regionD", label: "地点 17" },
  { canonical: "locar", region: "regionD", label: "地点 18" },

  { canonical: "hunter", region: "regionE", label: "地点 19" },
  { canonical: "liberty", region: "regionE", label: "地点 20" },
  { canonical: "locau", region: "regionE", label: "地点 21" },
  { canonical: "locav", region: "regionE", label: "地点 22" },
  { canonical: "locaw", region: "regionE", label: "地点 23" },
  { canonical: "locax", region: "regionE", label: "地点 24" },
  { canonical: "locay", region: "regionE", label: "地点 25" },
  { canonical: "locaz", region: "regionE", label: "地点 26" },
  { canonical: "locba", region: "regionE", label: "地点 27" },

  { canonical: "locbb", region: "regionF", label: "地点 28" },
  { canonical: "locbc", region: "regionF", label: "地点 29" },
  { canonical: "locbd", region: "regionF", label: "地点 30" },
  { canonical: "locbe", region: "regionF", label: "地点 31" },
  { canonical: "locbf", region: "regionF", label: "地点 32" },
  { canonical: "locbg", region: "regionF", label: "地点 33" },
  { canonical: "locbh", region: "regionF", label: "地点 34" },
  { canonical: "locbi", region: "regionF", label: "地点 35" },
  { canonical: "locbj", region: "regionF", label: "地点 36" },
  { canonical: "locbk", region: "regionF", label: "地点 37" },

  { canonical: "locbl", region: "regionG", label: "地点 38" },
  { canonical: "locbm", region: "regionG", label: "地点 39" },
  { canonical: "locbn", region: "regionG", label: "地点 40" },
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
  brighton: "locbc",
  locbh: "locbh",
  akaam: "locbe",
  akaan: "locbj",
  akaao: "locbk",
  akaap: "locaf",
  akaaq: "locag",
  akaar: "locao",
  akaas: "locae",
};

const BY_CANONICAL = new Map(VENUES.map((r) => [r.canonical, r]));

/**
 * 重名到必须带限定词才说得清的。**故意不给默认值** —— 猜一个就等于把
 * 「看得见的含糊」变成「看不见的错数据」。界面上会标红并列出可选项。
 */
const AMBIGUOUS: Record<string, string[]> = {
  hiddenvalley: ["locba", "locbi"],
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

/**
 * 这个地点要什么资源。库里只收 Alpha，所以在册的一律是 alpha；认不出来返回 null。
 * 以后加 Beta 时把每个场地的 item 标回来，这里改成读那个字段就行
 * （CLAUDE.md「做 Beta 功能时记得先做这件事」）。
 */
export function requiredItem(location?: string | null): ItemType | null {
  return normalizeLocation(location) ? "alpha" : null;
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
 * 这个资源的类型进不进得去这个地点。库里只有 Alpha 的地点，
 * 所以：认得的地点 + alpha 资源 = true，认得的地点 + beta 资源 = false，认不得 = null（不知道）。
 */
export function itemFits(
  location: string | null | undefined,
  itemType: string | null | undefined
): boolean | null {
  if (!normalizeLocation(location)) return null;
  if (itemType !== "beta" && itemType !== "alpha") return null;
  return itemType === "alpha";
}

/** 输入框补全用的选项：值是库里的写法，旁边显示全称和区域 */
export const LOCATION_OPTIONS: {
  value: string;
  label: string;
  region: Region;
  hint: string;
}[] = VENUES.map((r) => ({
  value: r.canonical,
  label: r.label,
  region: r.region,
  hint: `${r.label} · ${REGION_LABELS[r.region]}`,
})).sort((a, b) => a.value.localeCompare(b.value));
