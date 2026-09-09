// order_notes.internal_note 这一列里现在混着两种东西：
//
//   1) 人手填的备注 —— 纯文本，比如「尾款没结」
//   2) 一个 JSON 信封 —— {"kind":"order-reason-v1","category":...,"detail":...}
//
// 第 2 种是「取消原因」那个功能写进去的。那个功能的代码后来被撤掉了，
// **但库里已经写过这样的行**。不拆开的话，整段 JSON 会原样印到色块右上角
// 和 tooltip 上（实测 xhs 那一单就是这样）。
//
// 所以读备注一律走这里拆一层。只认这一种已知信封，其它内容原样返回——
// 别自作聪明去猜，万一有人的备注真的以 { 开头，不能给人吞掉。
const REASON_ENVELOPE = "order-reason-v1";

export function readNoteText(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  // 不是对象字面量就肯定不是信封，省掉一次 JSON.parse
  if (!s.startsWith("{")) return s;

  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && parsed.kind === REASON_ENVELOPE) {
      // 信封里真正给人看的就是 detail；没有 detail 就当没备注，
      // 也好过把 category 那种内部枚举名印到界面上
      return typeof parsed.detail === "string" ? parsed.detail.trim() : "";
    }
  } catch {
    // 不是合法 JSON，那它就是一条以 { 开头的普通备注
  }
  return s;
}
