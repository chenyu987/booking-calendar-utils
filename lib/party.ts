// 把 male_count / female_count 显示成「2男1女」这种，跟现在 Sheet 里的写法一致
export function formatParty(
  maleCount?: number | null,
  femaleCount?: number | null
): string {
  const male = maleCount ?? 0;
  const female = femaleCount ?? 0;
  const parts: string[] = [];
  if (male > 0) parts.push(`${male}男`);
  if (female > 0) parts.push(`${female}女`);
  return parts.length > 0 ? parts.join("") : "-";
}

/**
 * 把「人数输入框里那串字」变成一个人数。
 *
 * 建单弹窗里这两个框原来是数字 state（`value={male}` + `Number(e.target.value)`），
 * 有两个毛病，都是 React 对 `<input type="number">` 的特殊处理带来的：
 *
 *   1. **清不空。** 框里删光 → `Number("")` 得 0 → state 还是 0 → React 看到
 *      「value 是 0 而 DOM 是空」这个特例，立刻把 "0" 塞回去。所以想重填一个数，
 *      得先全选再打，不能先删后打。
 *   2. **「01」赖着不走。** 在 "0" 后面打个 1 → DOM 是 "01" → `Number("01")` 是 1 →
 *      state 变 1 → React 更新受控 number 框时用的是**宽松比较**
 *      （`node.value != value`，`"01" != 1` 为假），于是认为不用改，DOM 就一直是 "01"。
 *      数据其实是对的（存进去是 1），但看着像坏了。
 *
 * 所以改成存字符串、框里空着就是 0（跟同一个弹窗里单价/总价那两个框一个写法），
 * 解析集中到这里来。空、空白、负数、小数、垃圾字符一律落到一个合法的人数上 ——
 * 这个值会直接变成订单要几个资源，不能出 NaN，也不能出 -1。
 */
export function parseCount(raw: string | null | undefined): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
