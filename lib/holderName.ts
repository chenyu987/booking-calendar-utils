// 订单色块里那一行「已配的资源」显示成什么。
//
// 色块一行就那么宽，写全名（"jordan doe"）两三个资源就把这一行挤满了。
// 平时认人靠的是 first name，所以默认只显示 first name；
// **只有撞名的时候**才往后补姓氏的字母，补到能分开为止：
//
//   admin1 chen / admin1 Yoon  →  admin1C / admin1Y
//   simon kwon / simon kim   →  simonK 还是一样 → simonKw / simonKi
//
// 补的第一个字母大写、后面的照原样：一眼能看出「这是用来区分的」，而不是名字的一部分。
// 中间不留空格 —— 留了就像「名 + 姓」，反而会被当成两个词读。
//
// 撞名的判断是**全局**的（整页所有物主一起看），不是每个色块各算各的 ——
// 各算各的话，同一个资源在这单显示成「admin1」、在那单显示成「admin1C」，
// 看着像两个人。

/** "jordan doe" → { first: "jordan", last: "doe" }；单名的 last 是空 */
function split(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join("") };
}

/** 取姓氏的前 n 个字母，首字母大写；没有姓氏就返回空 */
function suffix(last: string, n: number): string {
  if (!last || n <= 0) return "";
  const part = last.slice(0, n);
  return part[0].toUpperCase() + part.slice(1);
}

/**
 * 一批物主全名 → 每个全名该显示成什么。
 *
 * 规则：first name 不撞就只显示 first name；撞了就往后补姓氏的字母，
 * 一次补一个，补到这一组里互不相同为止。姓氏用完了还分不开
 * （比如两个人都叫「oshn」、都没有姓），那就没有别的信息可用了，显示原样。
 *
 * 撞名比较不分大小写：库里的名字大小写很随意（"jordan doe" / "Simon Kwon"
 * 混着），按原样比会把同一个 first name 判成两个人。
 */
export function shortHolderNames(fullNames: string[]): Map<string, string> {
  const byFirst = new Map<string, Set<string>>();
  for (const full of fullNames) {
    const { first } = split(full);
    if (!byFirst.has(first.toLowerCase())) byFirst.set(first.toLowerCase(), new Set());
    byFirst.get(first.toLowerCase())!.add(full);
  }

  const out = new Map<string, string>();
  for (const [, group] of byFirst) {
    const people = [...group].map((full) => ({ full, ...split(full) }));

    if (people.length === 1) {
      out.set(people[0].full, people[0].first || people[0].full);
      continue;
    }

    const maxLast = Math.max(...people.map((p) => p.last.length));
    let labels: string[] | null = null;
    // 从补一个字母开始，一次多补一个，直到这一组里互不相同
    for (let n = 1; n <= maxLast; n++) {
      const tryLabels = people.map((p) => p.first + suffix(p.last, n));
      if (new Set(tryLabels.map((l) => l.toLowerCase())).size === tryLabels.length) {
        labels = tryLabels;
        break;
      }
    }
    // 补满了还分不开：没有别的信息可用，显示原样（trim 一下，别把多余空格带出去）
    if (!labels) labels = people.map((p) => p.full.trim().replace(/\s+/g, " "));
    people.forEach((p, i) => out.set(p.full, labels![i]));
  }
  return out;
}
