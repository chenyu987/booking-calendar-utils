// 折叠块。用原生 <details> 而不是 useState —— 这一页全是 Server Component，
// 展开收起是纯展示状态，没必要为它引一个客户端组件进来。
//
// **summary 上要带能回答问题的信息**（「2 条在等」「1 张」），不然折叠只是把东西
// 藏起来、逼人一个个点开，比摊着还烦。收起来的前提是收起来之后照样看得见状态。

export const summaryCss = `
  .disc > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    user-select: none;
  }
  .disc > summary::-webkit-details-marker { display: none }
  .disc > summary:hover { background: var(--surface-2) }
  /* 自己画箭头，展开时转 90°。原生那个三角在两套配色下颜色不受控 */
  .disc > summary::before {
    content: "";
    width: 0; height: 0;
    border-left: 5px solid var(--text-faint);
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    transition: transform .12s ease;
    flex-shrink: 0;
  }
  .disc[open] > summary::before { transform: rotate(90deg) }
`;

export default function Disclosure({
  title,
  badge,
  badgeColor,
  open,
  children,
}: {
  title: string;
  /** 收起来的时候就该看得见的那句话 */
  badge?: string;
  badgeColor?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="disc" open={open} style={boxStyle}>
      <summary>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 12, color: badgeColor ?? "var(--text-faint)" }}>{badge}</span>
        )}
      </summary>
      <div style={{ padding: "0 12px 12px" }}>{children}</div>
    </details>
  );
}

const boxStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  marginTop: 10,
};
