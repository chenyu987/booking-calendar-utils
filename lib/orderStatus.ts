// 排期表上每个状态一个颜色，跟 Sheet 里手工标色一个作用
export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> =
  {
    created: { bg: "#f1f1f1", border: "#d0d0d0", text: "#444" },
    itemAssigned: { bg: "#e3f0fb", border: "#a9cdeb", text: "#1c4e78" },
    pendingPickUp: { bg: "#fdf0dc", border: "#e9c68a", text: "#7a5312" },
    pendingPayment: { bg: "#fbe9e7", border: "#eab3aa", text: "#8a2f21" },
    complete: { bg: "#e6f4e9", border: "#a8d5b5", text: "#1f5c33" },
    cancelled: { bg: "#eeeeee", border: "#cccccc", text: "#888" },
    refunded: { bg: "#efe7f5", border: "#c9b0dc", text: "#5a3878" },
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
