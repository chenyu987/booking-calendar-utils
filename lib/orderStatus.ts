// 排期表上每个状态一个颜色，跟 Sheet 里手工标色一个作用
export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> =
  {
    created: { bg: "var(--st-created-bg)", border: "var(--st-created-border)", text: "var(--text-muted)" },
    itemAssigned: { bg: "var(--st-assigned-bg)", border: "var(--st-assigned-border)", text: "var(--link)" },
    pendingPickUp: { bg: "var(--st-pickup-bg)", border: "var(--st-pickup-border)", text: "var(--st-pickup-text)" },
    pendingPayment: { bg: "var(--st-payment-bg)", border: "var(--st-payment-border)", text: "var(--st-payment-text)" },
    complete: { bg: "var(--st-complete-bg)", border: "var(--st-complete-border)", text: "var(--ok)" },
    unconfirmed: { bg: "var(--st-unconfirmed-bg)", border: "var(--st-unconfirmed-border)", text: "var(--st-unconfirmed-text)" },
    // 文字用自己的 st-cancelled-text，不蹭 --text-faint —— 底色压深之后
    // #888888 在上面对比度不够，而 --text-faint 是全站共用的，动不得
    cancelled: { bg: "var(--st-cancelled-bg)", border: "var(--st-cancelled-border)", text: "var(--st-cancelled-text)" },
    needRefund: { bg: "var(--st-needrefund-bg)", border: "var(--st-needrefund-border)", text: "var(--st-needrefund-text)" },
  };

// 这个对象的**顺序就是界面上图例和下拉框的顺序**，按流程走：
// 待处理（起点）→ 已分配 → 待取资源 → 待付款 → 已完成，然后是三个「没正常走完」的。
//
// `unconfirmed`（未确认）是**手动**打的模糊态：单子已经进来了，但人突然说不准
// 到底做不做。它不是流程起点（起点永远是 created），所以排在后面那一簇，
// 跟已取消挨着 —— 都是「先不往下推」的意思。它的钱不算流水（见 lib/revenue.ts）。
//
// 这里的 key 集合同时是**服务端的白名单**：bulk-status 和 save-field 两个 route
// 都用 `STATUS_LABELS[status]` 判合法，所以从这里删掉一个状态，curl 也就打不进来了。
export const STATUS_LABELS: Record<string, string> = {
  created: "待处理",
  itemAssigned: "已分配",
  pendingPickUp: "待取资源",
  pendingPayment: "待付款",
  complete: "已完成",
  unconfirmed: "未确认",
  cancelled: "已取消",
  needRefund: "需退款",
};

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.created;
}

// 状态下拉框该渲染哪些选项。
//
// 标准的那几个，**外加**：当前这一单的状态如果不在 STATUS_LABELS 里
// （删过某个状态、或者别处直接写进库的），要为它单独补一条。
//
// 为什么必须补：`<select defaultValue={o.status}>` 匹配不上任何 option 时，
// 浏览器会把 `select.value` 落到第一项。而 ClickOutsideDeselect 判断「这个字段
// 改没改」用的是 `value !== data-original` —— 补不上 option，这个判断就**反过来
// 恒成立**，点一下别处就把第一项悄悄写进库，没人碰过那个下拉框。
// 2026-09-13 真出过：删掉 refunded 之后，那一单自己变成了「待处理」。
export function statusOptions(
  current: string | null | undefined
): { value: string; label: string }[] {
  const known = Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  const cur = current ?? "";
  // 空状态不补：那不是「有个认不出的值」，补出来是一条空选项
  if (!cur || STATUS_LABELS[cur]) return known;
  // 认不出来的原样显示，让人看得见库里到底是什么
  return [{ value: cur, label: cur }, ...known];
}
