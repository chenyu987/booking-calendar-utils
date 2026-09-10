// 排期表上每个状态一个颜色，跟 Sheet 里手工标色一个作用
export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> =
  {
    created: { bg: "var(--st-created-bg)", border: "var(--st-created-border)", text: "var(--text-muted)" },
    itemAssigned: { bg: "var(--st-assigned-bg)", border: "var(--st-assigned-border)", text: "var(--link)" },
    pendingPickUp: { bg: "var(--st-pickup-bg)", border: "var(--st-pickup-border)", text: "var(--st-pickup-text)" },
    pendingPayment: { bg: "var(--st-payment-bg)", border: "var(--st-payment-border)", text: "var(--st-payment-text)" },
    complete: { bg: "var(--st-complete-bg)", border: "var(--st-complete-border)", text: "var(--ok)" },
    cancelled: { bg: "var(--st-cancelled-bg)", border: "var(--st-cancelled-border)", text: "var(--text-faint)" },
    refunded: { bg: "var(--st-refunded-bg)", border: "var(--st-refunded-border)", text: "var(--st-refunded-text)" },
  };

export const STATUS_LABELS: Record<string, string> = {
  created: "待匹配",
  itemAssigned: "已分配",
  pendingPickUp: "待取资源",
  pendingPayment: "待付款",
  complete: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.created;
}
