"use client";

// 分配模式里的删单红叉：真删库（配的资源、收款记录跟着级联删掉），所以点之前弹窗确认一下
export default function DeleteOrderButton({
  orderId,
  deleteAction,
  style,
}: {
  orderId: string;
  deleteAction: (formData: FormData) => Promise<void>;
  style?: React.CSSProperties;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        if (!confirm("确定删除这个订单？配的资源、收款记录会一起删掉，不能撤销。")) {
          e.preventDefault();
        }
      }}
      style={style}
    >
      <input type="hidden" name="order_id" value={orderId} />
      <button
        type="submit"
        title="删除这个订单"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#c0392b",
          fontSize: 14,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        ×
      </button>
    </form>
  );
}
