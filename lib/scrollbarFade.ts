// 日历滚动条的淡出。
//
// **为什么要自己算而不是用 CSS transition**：Chrome 不给
// `::-webkit-scrollbar-*` 这类伪元素跑 transition —— 写了也不报错，颜色直接
// 一跳到底（实测：0.1 的下一帧就是 0，中间一个值都没有）。所以那条
// `transition: background 5s` 一直是死的，调多少秒都没区别。
//
// 能动的办法：伪元素读得到宿主元素上的自定义属性，所以由 JS 按时间把
// `--cal-thumb-a` 一格一格降下去，滚动条就跟着重绘。

/** 停手之后先原样停多久 */
export const HOLD_MS = 1400;
/** 然后用多久淡到全透明 */
export const FADE_MS = 5000;
/** 显出来时的不透明度 */
export const PEAK_ALPHA = 0.1;

/** 距上一次滚动过了多久 → 这会儿滚动条该多不透明 */
export function fadeAlpha(
  elapsedMs: number,
  hold = HOLD_MS,
  fade = FADE_MS,
  peak = PEAK_ALPHA
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return peak;
  if (elapsedMs <= hold) return peak;
  if (fade <= 0) return 0;
  const done = (elapsedMs - hold) / fade;
  if (done >= 1) return 0;
  return peak * (1 - done);
}
