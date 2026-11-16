// Resource 管理页的几样样式，服务端渲染的展示行和浏览器里的编辑行（ResourceEditing.tsx）共用。

// 有效期一列：展示是一行，编辑态 / 筛选行是两个日期框夹一个「~」。表头、筛选行、编辑态、展示四处都取它。
// 两段放一行要 337px（13px system-ui），为了这几个资源把列放到那么宽，别的列（排期）就被挤没了 ——
// 所以宽度按一段给，两段的新的在前、旧的被省略号截掉，鼠标放上去看全的
export const VALIDITY_WIDTH = 270;
export const rangeInputStyle = { flex: 1, minWidth: 0 };
export const tildeStyle = { color: "var(--text-faint)", flexShrink: 0, fontSize: 11 };
// 展示行每格都只占一行，放不下就省略号（title 里是全的）—— 哪一格折行，那一行就比别的高
export const oneLineStyle = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

// 三根能伸缩的列（Provider / 物主姓名 / 排期）各有个最小宽度。原来是 minWidth:0 + flex，
// 别的列都是写死的宽度，窗口一窄这三列就被挤成 0，名字整个看不见。
// 表头、筛选行、展示行、编辑行四处都从这里取，别在页面里再写一份
export const PROVIDER_COL = { flex: 1.1, minWidth: 80 } as const;
export const HOLDER_COL = { flex: 1.1, minWidth: 140 } as const;
export const BOOKING_COL = { flex: 1.8, minWidth: 200 } as const;
// 物主地址（城市, 州 / 省），看 beta 物主都在哪
export const ADDRESS_COL = { flex: 1, minWidth: 120 } as const;
// 资源类型：「beta unknown」要放得下
export const ITEM_WIDTH = 100;
// 谁的联系人（物主在哪个管理员的聊天里），两个标签并排要放得下
export const CONTACT_WIDTH = 120;
// 整张表最窄多宽：上面四根的最小宽度 + 写死宽度的那几列（资源类型、性别 60、生日 96、
// 年龄 70、有效期、挂牌状态 110、操作 110）+ 十二格之间十一个 6px 的间距（rowStyle 的 gap）。
// 窗口比它窄时整张表在内容区里左右滑，不再往里挤
export const RESOURCE_TABLE_MIN_WIDTH =
  PROVIDER_COL.minWidth + HOLDER_COL.minWidth + BOOKING_COL.minWidth + ADDRESS_COL.minWidth +
  ITEM_WIDTH + CONTACT_WIDTH + 60 + 96 + 70 + VALIDITY_WIDTH + 110 + 110 + 11 * 6;
