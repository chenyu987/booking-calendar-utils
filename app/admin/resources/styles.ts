// Resource 管理页的几样样式，服务端渲染的展示行和浏览器里的编辑行（ResourceEditing.tsx）共用。

// 有效期一列：展示是一行，编辑态 / 筛选行是两个日期框夹一个「~」。表头、筛选行、编辑态、展示四处都取它。
// 两段放一行要 337px（13px system-ui），为了这几个资源把列放到那么宽，别的列（排期）就被挤没了 ——
// 所以宽度按一段给，两段的新的在前、旧的被省略号截掉，鼠标放上去看全的
export const VALIDITY_WIDTH = 270;
export const rangeInputStyle = { flex: 1, minWidth: 0 };
export const tildeStyle = { color: "var(--text-faint)", flexShrink: 0, fontSize: 11 };
// 展示行每格都只占一行，放不下就省略号（title 里是全的）—— 哪一格折行，那一行就比别的高
export const oneLineStyle = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;
