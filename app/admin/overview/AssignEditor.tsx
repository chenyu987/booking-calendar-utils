"use client";

import ResizableOrderBlock from "./ResizableOrderBlock";
import OptimisticEditForm from "./OptimisticEditForm";
import { UnassignButton } from "./AssignActions";
import LocationInput from "@/components/LocationInput";
import { statusOptions } from "@/lib/orderStatus";
import {
  BLOCK_BASE_STYLE,
  COUNT_BOX,
  COUNT_GAP,
  FIELD_SIZING_CONTENT,
  MONEY_SLOT,
} from "./blockGeometry";

// 排期总览：分配态那个色块（姓名 / 地点 / 状态 / 备注 / 金额 / 人数 / 已配的资源，全是输入框）。
//
// **只有这一份**，两处用：
//   - 服务端渲染 ?assign=<id> 时（page.tsx）
//   - 点下去当场画（InstantAssign）：整页渲染回来要一秒多，这段时间里先把这同一个组件
//     画在同一个格子里，人就能直接打字；服务端那一份到了，把打的字搬过去、自己撤掉
// 两边是同一个组件、同一份数据，所以几何一模一样 —— 「进出编辑态差 0」那条规矩，
// 对「当场画的」和「服务端画的」之间同样成立。原来这段 JSX 写在 page.tsx 里（editInner）。

/** 色块里那一张已配的资源 */
export type EditorCard = {
  id: string;
  /** 色块上显示的名字（撞名才补姓氏字母，lib/holderName.ts），服务端算好 */
  label: string;
  /** 这个资源同一天还配在别的单上（lib/doubleBooking.ts）—— 标红 */
  clash: boolean;
};

/** 画一个分配态色块要的全部数据。服务端算好，可序列化 */
export type EditorData = {
  orderId: string;
  orderStart: string;
  /** 外层样式里每一单不一样的那部分（位置、底色、文字色、分配态的边框和光圈）；其余在 BLOCK_BASE_STYLE */
  style: React.CSSProperties;
  /**
   * 整个连续段都在这一带里才给拖拽改天数的把手（ResizableOrderBlock）；被带子边界切开的
   * 是 null —— 拖出去那一头算不出正确日期，会把另一段的日子抹掉
   */
  resizable: { runStart: string; runEnd: string; startIndex: number; length: number; laneRow: number } | null;
  title: string;
  customerName: string;
  location: string;
  locationHint: string;
  badLocation: boolean;
  status: string;
  note: string;
  amount: number | string | null;
  maleCount: number;
  femaleCount: number;
  need: { maleFilled: number; femaleFilled: number; maleGap: number; femaleGap: number };
  cards: EditorCard[];
  /** 撤销分配那个叉的底色和边框：跟色块一样，盖在字上也看得清 */
  cardBg: string;
  cardBorder: string;
  /** 这一单算谁的（effectiveAdminId：没写就是主要管理员）。浮动条上「谁的单」那个下拉显示它 */
  adminId: string | null;
};

export default function AssignEditor({
  d,
  timeline,
  exitHref,
  instant = false,
}: {
  d: EditorData;
  /** 这一带（这一行日历）的日子，拖拽改天数时换算格子用 */
  timeline: string[];
  exitHref: string;
  /** 点下去当场画的那一份（还没等到服务端）。服务端那一份到了就撤，见 InstantAssign */
  instant?: boolean;
}) {
  const inner = (
      <div
        id="assign-active-block"
        // 认这是哪一单的编辑框：点下去当场画的那一份（InstantAssign）和服务端那一份
        // 可能同时在页面上一小会儿，id 会重复 —— 收集改动要按单号找，不能按 id
        data-assign-editor={d.orderId}
        data-instant={instant ? "1" : undefined}
        // 内边距 / 字号 / 行高都由外层的 blockStyle 给了，这儿别再写一遍 ——
        // 写两遍就是下一次「进出编辑态错开几像素」的来源
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          height: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
        title={d.title}
      >
        {(
          <>
            {/* gap 是 0，分隔符自己带空格。普通态那行是一整串文字
                「姓名 · 地点」，中间就是普通空格；编辑态要是用 flex gap
                去凑，宽度永远差个一两像素，进出编辑就看得出来在动。
                直接用同样的字符，横向位置自然就对上了。
                备注跟前面那段的间距由它自己的 marginLeft 给 */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 0,
                overflow: "hidden",
              }}
            >
              <OptimisticEditForm
                exitHref={exitHref}
                // minWidth 跟里面输入框的下限对齐：只给 0 的话表单会被压到
                // 比输入框还窄，输入框撑出去盖住旁边的地点和备注。
                // 给到 48：姓名每一单都有，是这一行最该看见的东西，
                // 不能为了给偶尔才填的备注腾地方就把它压没了。
                // minWidth 交给里面的输入框（28）就够了：这儿再写 48 的话，
                // 名字短的时候（「1123」才 27px）表单被撑到 48，后面的
                // 「· 地点」整体右移二十几像素 —— 进编辑态就是「东西动了」
                style={{ display: "flex", minWidth: 0, flexShrink: 1 }}
              >
                <input type="hidden" name="order_id" value={d.orderId} />
                <input
                  name="customer_name"
                  className="assign-fit"
                  // 有 placeholder 才能用 :placeholder-shown 区分「空着」和
                  // 「填了但很短」—— minWidth 只该管前者，见下面那条注释
                  placeholder="昵称"
                  defaultValue={d.customerName}
                  data-original={d.customerName}
                  style={{
                    ...FIELD_SIZING_CONTENT,
                    // minWidth **不写在这儿**：写死 28 的话，名字短的
                    // （「xhs」才 20px）会被撑到 28，后面的「· 地点」
                    // 整体右移四五像素 —— 进出编辑又在动。
                    // 交给 .assign-fit：填了就贴着内容，空着才留出点得中的宽度
                    maxWidth: "100%",
                    fontSize: 12,
                    fontWeight: 500,
                    // 内边距必须是 0：普通态那行文字是从内容左边缘开始的，
                    // 给 3px 就整行右移 3px
                    padding: 0,
                    color: "inherit",
                    background: "transparent",
                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                    // 占的横向位置，用内边距 +1 补回来。
                    border: "none",
                    lineHeight: 1.3,
                  }}
                />
              </OptimisticEditForm>
              {/* 连空格一起，跟普通态的 `{` · ${location}`}` 一模一样。
                  whiteSpace: pre 是必须的，不然两头的空格会被折叠掉 */}
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  flexShrink: 0,
                  whiteSpace: "pre",
                }}
              >
                {" · "}
              </span>
              <OptimisticEditForm
                exitHref={exitHref}
                // 地点同理，每单都有，给 40
                // 同上：minWidth 交给里面的输入框，别在表单上再设一个
                style={{ display: "flex", minWidth: 0, flexShrink: 1 }}
              >
                <input type="hidden" name="order_id" value={d.orderId} />
                <LocationInput
                  name="location"
                  className="assign-fit"
                  placeholder="地点"
                  defaultValue={d.location ?? ""}
                  data-original={d.location ?? ""}
                  title={d.locationHint || undefined}
                  style={{
                    // 同上：minWidth 交给 .assign-fit，别写死
                    ...FIELD_SIZING_CONTENT,
                    ["--fit-empty" as any]: "22px",
                    maxWidth: "100%",
                    // 12 不是 11：普通态里地点跟姓名是同一串文字，
                    // 同一个字号。写 11 的话一进编辑态地点就缩一号
                    fontSize: 12,
                    opacity: d.badLocation ? 1 : 0.7,
                    padding: 0,
                    // 地点名库里认不出来就标红。这里正好是能当场改掉的地方
                    color: d.badLocation ? "var(--danger)" : "inherit",
                    fontWeight: d.badLocation ? 600 : 400,
                    background: "transparent",
                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                    // 占的横向位置，用内边距 +1 补回来。
                    border: "none",
                    lineHeight: 1.3,
                  }}
                />
              </OptimisticEditForm>
              {/* 备注框顶到右上角，跟平时状态显示备注的位置**同一个地方**——
                  进出编辑不用重新找。右对齐是为了让文字结束的位置也对上。
                  flex:1 吃掉中间剩余宽度，也让它第一个被压缩：
                  姓名和地点用的是 field-sizing:content，本来就只占内容那么宽。 */}
              {/* 弹簧：把右边那一组顶到右边。跟普通态那一行放的是同一个 ——
                  有了它，分配态中间多出来的状态框只会把弹簧压扁，
                  备注和金额一像素都不挪。这是这一行「进出编辑不动」的关键 */}
              <span style={{ flex: "1 1 0", minWidth: 0 }} />
              <OptimisticEditForm
                exitHref={exitHref}
                className="assign-status"
                style={{
                  display: "flex",
                  gap: 4,
                  // 跟里面 select 的 minWidth 保持一致：只给 0 的话外层
                  // 缩到 0、里面的 select 撑出来，就压到金额上去了
                  minWidth: 24,
                  flexShrink: 1,
                }}
              >
                <input type="hidden" name="order_id" value={d.orderId} />
                <select
                  name="status"
                  defaultValue={d.status}
                  data-original={d.status}
                  style={{
                    fontSize: 11,
                    // 高度写死 16：浏览器给 select 的默认行高比 11px 字号
                    // 需要的多 3px，不压掉的话这几行正好撑出格子。
                    // boxSizing 不能省，不然 padding 又加回去了。
                    height: 16,
                    lineHeight: "14px",
                    padding: "0 2px",
                    boxSizing: "border-box",
                    color: "var(--text)",
                    // 允许被挤扁，但留 24px 的底：再窄就只剩一条缝，
                    // 看不出那是个下拉框、也点不中
                    width: "100%",
                    minWidth: 24,
                  }}
                >
                  {/* 认不出来的状态要补一条 option，不然点一下别处
                      就会被悄悄改写 —— 原因写在 statusOptions 里 */}
                  {statusOptions(d.status).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </OptimisticEditForm>
              {/* **只有已经有备注的单子**才在色块里放这个框。
                  空着的框是纯浪费 —— 多数单子没有备注，却让每个资源的
                  编辑态常年挤着一个空框，还把姓名和地点往里压。
                  没备注的去顶上那条浮动条加（AssigningBar 里的 NoteInput），
                  两处永远只出现一个。
                  已经有的就在这儿直接改：它本来就显示在这个位置，就地改最顺手 */}
              {d.note ? (
                <OptimisticEditForm
                  exitHref={exitHref}
                  className="assign-note"
                  // flex-basis 给 0：宽松时把剩下的空间全吃掉（备注框要多大有多大），
                  // 紧张时自己先缩到 22 这个「还点得进去」的下限，把地方让给
                  // 姓名和地点——那两个每单都有，备注偶尔才有。
                  // 缩成小方块之后也不影响用：点进去（:focus-within）会自动
                  // 撑到一半宽，写完一挪走又缩回去，见上面那段 CSS。
                  // marginLeft 4：普通态那一行「姓名·地点」和备注之间是 gap:4，
                  // 编辑态整行 gap 改成 0 了，这一段的间距挪到这儿单独给
                  // **flex-basis 必须是 0**。改成 auto 试过一次，当场就被
                  // 几何测试逮住：基准按内容算的话，这个框会先占掉 71px，
                  // 把姓名压到 11px、地点压到 26px，「·」整个左移 9.2px。
                  // 基准 0 = 只吃剩余空间，永远不会从姓名地点嘴里抢。
                  // 上限跟普通态那段备注一样 50%；真打字时 :focus-within
                  // 会撑到 55%（见上面那段 CSS）
                  style={{ display: "flex", flex: "1 1 0", maxWidth: "50%", minWidth: 22, marginLeft: 4 }}
                >
                  <input type="hidden" name="order_id" value={d.orderId} />
                  <input
                    name="note"
                    placeholder="备注"
                    defaultValue={d.note}
                    data-original={d.note}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      textAlign: "right",
                      fontSize: 11,
                      padding: "0 3px",
                      color: "inherit",
                      background: "transparent",
                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                      // 占的横向位置，用内边距 +1 补回来。
                      border: "none",
                      lineHeight: 1.3,
                    }}
                  />
                </OptimisticEditForm>
              ) : null}
              <OptimisticEditForm
                exitHref={exitHref}
                style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
              >
                <input type="hidden" name="order_id" value={d.orderId} />
                <span
                  className="assign-money-sign"
                  style={{ fontSize: 11, opacity: 0.8, flexShrink: 0 }}
                >
                  $
                </span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={d.amount ?? ""}
                  data-original={d.amount ?? ""}
                  style={{
                    ...FIELD_SIZING_CONTENT,
                    // 字号 / 淡度 / 右对齐跟普通态同一份（MONEY_SLOT）
                    ...MONEY_SLOT,
                    appearance: "textfield",
                    // 不写死宽度：让 field-sizing 跟着金额位数走，
                    // 三位数的单子就只占三位数的地方
                    // minWidth 别给大：给 26 的话三位数的金额（约 21px）
                    // 撑不满，输入框比文字宽，$ 被往左顶开五六像素，
                    // 进出编辑钱号就跳。18 够点得中，其余交给 field-sizing
                    minWidth: 18,
                    maxWidth: 64,
                    // 内边距 0：普通态的数字是贴着右边缘的，
                    // 留 2px 数字就往左挪 2px
                    padding: 0,
                    color: "inherit",
                    background: "transparent",
                    // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                    // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                    // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                    // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                    // 占的横向位置，用内边距 +1 补回来。
                    border: "none",
                    lineHeight: 1.3,
                  }}
                />
              </OptimisticEditForm>
            </div>
            {/* nowrap：格子只有一列宽（一天的单子）时卡片名会换行，
                把写死高度的色块顶爆、底下那行被裁掉。宁可横着截断。
                截断之后后面的人够不着，所以这一行做成可以横着滚的
                （.cards-row，样式在上面那段 CSS 里）：触控板左右划、
                Shift+滚轮是浏览器原生的，纵向滚轮由 CardsRowScroll 接管。 */}
            {/* 进度和状态并排放一行：进度字很短，右边本来就空着。
                分成两行的话色块压到 80px 高就装不下，状态框会被裁掉 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4,
                // 一天的单子只有一列宽，六个输入框本来就塞不下；
                // 让它横着截断，别把色块顶高（高度是写死的，顶高就被裁）
                overflow: "hidden",
              }}
            >
              {/* 分配进度和「几男几女」合成一个控件：分母本来就是要几个人，
                  所以直接把 male_count/female_count 的输入框摆在分母的位置上。
                  平时状态那一行显示的是同一个「男1/1 女1/1」，进出编辑不换位置。
                  这里两个性别都画出来（formatNeed 会把 0 的那个藏掉），
                  不然想给纯男单加一个女生就没有框可以填。 */}
              <OptimisticEditForm
                exitHref={exitHref}
                data-need="1"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: COUNT_GAP,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <input type="hidden" name="order_id" value={d.orderId} />
                <span
                  style={{
                    color: d.need.maleGap === 0 ? "var(--ok)" : "var(--warn)",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  男{d.need.maleFilled}/
                  <input
                    name="male_count"
                    type="number"
                    min="0"
                    defaultValue={d.maleCount}
                    data-original={d.maleCount}
                    style={{
                      // 跟普通态那一格同一份尺寸（COUNT_BOX），不许各写各的
                      ...COUNT_BOX,
                      appearance: "textfield",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "inherit",
                      background: "transparent",
                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                      // 占的横向位置，用内边距 +1 补回来。
                      border: "none",
                      lineHeight: 1.3,
                    }}
                  />
                </span>
                <span
                  style={{
                    color: d.need.femaleGap === 0 ? "var(--ok)" : "var(--warn)",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  女{d.need.femaleFilled}/
                  <input
                    name="female_count"
                    type="number"
                    min="0"
                    defaultValue={d.femaleCount}
                    data-original={d.femaleCount}
                    style={{
                      // 跟普通态那一格同一份尺寸（COUNT_BOX），不许各写各的
                      ...COUNT_BOX,
                      appearance: "textfield",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "inherit",
                      background: "transparent",
                      // 输入框默认 line-height:normal，框比一行文字高一截、文字在框里垂直居中，
                      // 就比普通态的 <span> 低几像素。行高对齐色块的 1.3。
                      // border 得显式写 none——只删掉声明的话，浏览器给 input 的默认
                      // 2px inset 边框会冒出来，反而更高、还看得见。原来那 1px 透明边框
                      // 占的横向位置，用内边距 +1 补回来。
                      border: "none",
                      lineHeight: 1.3,
                    }}
                  />
                </span>
              </OptimisticEditForm>
            {/* 状态框和金额框都靠右下角：平时状态右下角显示的就是金额，
                两边位置对得上 */}
            {/* marginLeft:auto 把这一组顶到右边，**不能用 justifyContent:flex-end**：
                那个在装不下的时候会往左边溢出去，压在分配进度上面（一天的单子
                只有一列宽，正好会遇到）。auto margin 装不下时自动变 0，
                多出来的部分往右边溢出，被上一层的 overflow:hidden 干净地切掉 */}
              <div
                className="cards-row"
                // gap 归 0、淡度对齐普通态的 0.85：普通态这一行是一整串
                // 「♂名字 ♀名字」，资源与资源之间就是个普通空格。用 flex gap
                // 去凑宽度永远差一点，直接照抄那个空格（见下面的分隔符）
                style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  // 靠右，跟普通态那一份同一个锚。左边留给「男x/x 女x/x」
                  marginLeft: "auto",
                  minWidth: 0,
                  gap: 0,
                  fontSize: 11,
                  opacity: 0.85,
                  whiteSpace: "nowrap",
                }}
              >
                {d.cards.length > 0
                  ? d.cards.map((s, i) => (
                      <span
                        key={s.id}
                        className="assign-card"
                        data-card="1"
                        // relative：撤销那个叉靠它定位。叉是**绝对定位**的，
                        // 不占位置 —— 原来它排在文字后面，一进分配模式
                        // 后面所有东西就右移 14px，正是「进编辑东西动了」
                        style={{ position: "relative", whiteSpace: "pre" }}
                      >
                        {i > 0 ? " " : ""}
                        <span
                          // 分配态里同样标红 —— 两个状态得说同一件事
                          style={
                            s.clash
                              ? {
                                  color: "var(--danger)",
                                  fontWeight: 600,
                                  textDecoration: "underline wavy var(--danger)",
                                  textUnderlineOffset: 2,
                                }
                              : undefined
                          }
                        >
                          {s.label}
                        </span>
                        <UnassignButton
                          orderId={d.orderId}
                          resourceId={s.id}
                          className="assign-card-x"
                          style={{
                            // 贴在这个资源的右上角，盖住后面一点点。
                            // 平时透明+不可点，鼠标移到这个资源上才浮出来
                            position: "absolute",
                            right: -3,
                            top: -4,
                            width: 14,
                            height: 14,
                            padding: 0,
                            margin: 0,
                            boxSizing: "border-box",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 7,
                            // 底色跟色块一样：盖在字上面也看得清
                            background: d.cardBg,
                            border: `1px solid ${d.cardBorder}`,
                            color: "inherit",
                            fontSize: 11,
                            lineHeight: 1,
                            zIndex: 2,
                          }}
                        />
                      </span>
                    ))
                  : "未分配"}
              </div>
            </div>
          </>
        )}
      </div>
  
  );

  if (!d.resizable) {
    // 这一段被带子的边界切开了：不挂拖拽把手，只正常显示
    return (
      <div
        data-order-id={d.orderId}
        data-order-start={d.orderStart}
        style={{ ...BLOCK_BASE_STYLE, ...d.style, padding: 0 }}
      >
        {inner}
      </div>
    );
  }

  return (
    <ResizableOrderBlock
      orderId={d.orderId}
      orderStart={d.orderStart}
      runStart={d.resizable.runStart}
      runEnd={d.resizable.runEnd}
      startIndex={d.resizable.startIndex}
      length={d.resizable.length}
      timeline={timeline}
      laneRow={d.resizable.laneRow}
      // **必须从普通态那份派生，不能另写一份。** 这块反复出问题就是因为两个状态各维护
      // 一份样式。d.style 里只有位置、颜色和分配态的边框光圈（page.tsx 从 blockStyle 派生），
      // 内边距、字号、行高、圆角一律是 BLOCK_BASE_STYLE。gridRow / gridColumn 由
      // ResizableOrderBlock 自己算，它在 spread 之后再写，覆盖得掉
      style={{ ...BLOCK_BASE_STYLE, ...d.style }}
    >
      {inner}
    </ResizableOrderBlock>
  );
}
