import type { CSSProperties } from "react";

export const formStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  margin: "16px 0",
};
export const inputStyle: CSSProperties = {
  padding: 6,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
export const selectStyle: CSSProperties = inputStyle;
export const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 16,
};
export const thStyle: CSSProperties = {
  textAlign: "left",
  padding: 8,
  borderBottom: "1px solid var(--border)",
  fontSize: 13,
  color: "var(--text-muted)",
};
export const tdStyle: CSSProperties = {
  padding: 8,
  borderBottom: "1px solid var(--border)",
  fontSize: 14,
  verticalAlign: "top",
};
// marginTop 显式清零：<h1> 浏览器默认带 0.67em 上边距（这里约 13px），
// 白白把标题往下推一截
export const pageTitleStyle: CSSProperties = {
  fontSize: 20,
  marginTop: 0,
  marginBottom: 4,
};
export const helpTextStyle: CSSProperties = { color: "var(--text-muted)", fontSize: 13 };

// 可编辑列表用 flex 行而不是 <table>，因为 HTML 不允许 <form> 直接包住 <tr>
export const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: 12,
  color: "var(--text-muted)",
};
export const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 0",
  borderBottom: "1px solid var(--border)",
};
export const cellStyle: CSSProperties = {
  minWidth: 0,
  fontSize: 13,
};
export const dangerButtonStyle: CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--danger-soft-border)",
  background: "transparent",
  color: "var(--danger)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

// 行内操作用朴素文字链，不加边框，列表看起来才干净
export const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--text-muted)",
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
};
export const dangerLinkStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--danger)",
  fontSize: 13,
  cursor: "pointer",
};

// 段控件（「日历 | 台账」「1周 | 2周 | 4周 | 8周」这种）。
// **唯一出处** —— 同一个后台不该有两套开关长相，抄第二份就是迟早对不上
export const segStyle: CSSProperties = {
  padding: "3px 10px",
  fontSize: 12,
  border: "1px solid var(--border-strong)",
  color: "var(--text-muted)",
  textDecoration: "none",
  background: "var(--surface)",
  cursor: "pointer",
  lineHeight: 1.6,
};
export const segActiveStyle: CSSProperties = {
  ...segStyle,
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderColor: "var(--solid-bg)",
};
