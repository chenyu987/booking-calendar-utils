// 排期总览订单色块的几何常量 —— 普通态（page.tsx 服务端画）和分配态（AssignEditor，
// 服务端和「点下去当场画」的 InstantAssign 共用）都从这儿取。
//
// 原来写在 page.tsx 里；分配态的那一份挪成客户端组件之后，两边得 import 同一份 ——
// CLAUDE.md：「第二份数字和第二份样式是同一个 bug」。

/**
 * 色块外层样式里**跟哪一单无关**的那部分。位置（gridRow / gridColumn）和颜色
 * （底色、边框、光圈、文字）每一单不一样，page.tsx 算好了叠在这上面。
 */
export const BLOCK_BASE_STYLE = {
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
  overflow: "hidden",
  lineHeight: 1.3,
  // 空白处的新建选框也是这个 grid 的一员，没有这两条订单色块会被它盖住点不到
  position: "relative",
  zIndex: 1,
  // 让 @container 那条「窄色块藏 $」的规则对普通态也生效 ——
  // 只给分配态设的话，窄色块进出编辑就一个有钱号一个没有
  containerType: "inline-size",
} as const;

// Chrome 123+ 的 field-sizing:content——输入框跟着内容宽窄走。
// 分配模式的「姓名 · 地点」靠它才能像平时状态那样紧挨着；否则两个 flex:1 的框
// 各占一半，名字短的时候中间空一大截，看着很散。
// TS 的 CSSProperties 还没收这个属性，所以断言一下；不支持的浏览器退回默认宽度，
// 只是没那么紧凑，不会坏。
export const FIELD_SIZING_CONTENT = { fieldSizing: "content" } as React.CSSProperties;

// 第 3 行「男1/1」里分母那一格的尺寸。分配态那儿是个数字输入框，缩不到跟文字
// 一样窄（5px 宽点不中），所以反过来让**普通态也占同样的格子**——两个状态一样宽，
// 进出编辑那行就不动了。两边都用这一份，别各写各的。
/** 「男…」和「女…」两组之间的间距。两个状态共用，别一边写 gap 一边靠空格 */
// 「男…」和「女…」两组之间的间距。两个状态共用，别一边写 gap 一边靠空格。
// 2 → 1：分母那一格（COUNT_BOX）本来就只按一位数给，右边还有 1px 内边距，
// 加起来看着仍然偏空。人数不会到两位数（真有也是拆成几单），所以能收就收
export const COUNT_GAP = 1;

// 右下角那个金额。两个状态共用：普通态是文字、分配态是输入框，
// 但**右边缘、字号、淡度、右对齐**必须一模一样，不然进出编辑钱会挪位置。
// 输入框默认左对齐，普通态的文字是右对齐的 —— 这一条不写就差七八像素。
export const MONEY_SLOT: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.8,
  textAlign: "right",
  flexShrink: 0,
};

export const COUNT_BOX: React.CSSProperties = {
  display: "inline-block",
  boxSizing: "content-box",
  // **按一位数给**，不给两位数留位置。原来是 16（够写「12」），可实测最宽的
  // 数字才 7.3px，两个性别加起来白占了 18px —— 一天的单子内宽只有 136px，
  // 这 18px 正好是状态下拉框能不能露出来的分水岭。
  // 人数到 10 的单子实际上不存在（真有也是拆成几单处理），为这种情况常年
  // 占着位置不划算。真填了两位数，两个状态都是一样地溢出，位置还是对得上的。
  width: 8,
  // 左右各 1px，不是 2px。两个格子省下 4px —— 听着像抠，但这 4px 就是余量本身：
  // 只留 8px 宽的时候整行正好卡死（本地量出来状态框拿到 39px、它要的也正好
  // 是 39px），CI 的 Linux 字体宽那么零点几，直接就破了（38.56 < 39）。
  // 零余量的布局等于没修好，只是在这台机器上碰巧成立
  // 左 1 右 0：右边那 1px 全落在「1」和「女」中间，纯粹是空的。
  // 左边留 1px 是不让数字贴死在「/」上
  padding: "0 0 0 1px",
  textAlign: "left",
};
