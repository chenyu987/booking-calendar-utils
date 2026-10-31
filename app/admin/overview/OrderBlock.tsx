"use client";

import Link from "next/link";
import { BLOCK_BASE_STYLE, COUNT_BOX, COUNT_GAP, MONEY_SLOT } from "./blockGeometry";
import { statusColor } from "@/lib/orderStatus";
import { orderFrame } from "@/lib/orderFrame";
import { useIsPreviousUse, useIsSelected, usePatch } from "./assignSelection";
import { applyPatchToBlock } from "./blockPatch";

// 排期总览：普通态的订单色块（点它进分配态）。
//
// 原来是 page.tsx 里服务端直接画的一段 JSX。搬成客户端组件，服务端只传每一单的数据：
//   - 退出分配态要**当场**显示改过的新值（不等整页渲染回来），这得在浏览器里画得出普通态
//   - 顺带：服务端原来要把每个色块画好的整棵元素树（每个 span 一份内联样式对象）序列化
//     下发，一季 1800 单就是几 MB；现在只传数据
// JSX 是原样搬过来的，几何跟原来一模一样（e2e「进出分配态：几何不许变」盯着）。
// 分配态那份是 AssignEditor，同一套几何常量在 blockGeometry.ts。

/** 色块里那一张已配的资源 */
export type BlockCard = {
  id: string;
  /** 色块上显示的名字（撞名才补姓氏字母，lib/holderName.ts），服务端算好 */
  label: string;
  /** 这个资源同一天还配在别的单上（lib/doubleBooking.ts）：悬停说明；空串 = 没冲突 */
  clashTitle: string;
};

/** 画一段普通态色块要的全部数据（一单可能有好几段：日期不连续、被带子切开） */
export type BlockData = {
  orderId: string;
  orderStart: string;
  href: string;
  gridRow: number;
  gridColumn: string;
  /** 状态：底色、文字色、边框色都从它算（lib/orderStatus.ts），退出时改了状态当场换色 */
  status: string;
  /** 非主要管理员的单，边框是这个颜色（lib/orderFrame.ts）；null = 跟状态色 */
  adminColor: string | null;
  title: string;
  /** 抢画分配浮动条用的标题（OptimisticAssign） */
  label: string;
  /** 这一段放不放摘要（一单的每一带只放一次） */
  showDetail: boolean;
  /** 放编辑控件的那一段（整单只有一段）：当场画分配态时藏的是它 */
  editSeg: boolean;
  customerName: string;
  location: string | null;
  locationHint: string;
  badLocation: boolean;
  note: string;
  amount: number | string | null;
  need: {
    maleNeeded: number;
    femaleNeeded: number;
    maleFilled: number;
    femaleFilled: number;
    isComplete: boolean;
  };
  cards: BlockCard[];
};

export default function OrderBlock({ d: server }: { d: BlockData }) {
  // 选中 / 「上一次」/ 退出时改过还在存的字段 —— 全是客户端状态（assignSelection.ts），
  // 每个色块只订阅跟自己有关的那一个布尔 / 那一份，别的单变了这块不重画
  const selected = useIsSelected(server.orderId);
  const previousUse = useIsPreviousUse(server.orderId);
  const pending = usePatch(server.orderId);
  const d = pending ? applyPatchToBlock(server, pending.patch) : server;
  // 边框和光圈：状态 / 是哪个管理员的 / 选中 / 上一单，四件事一处算（lib/orderFrame.ts），
  // 分配态（AssignEditor）也从那儿取
  const c = statusColor(d.status);
  const frame = orderFrame({
    statusBorder: c.border,
    adminColor: d.adminColor,
    assigning: selected,
    previousUse,
  });
  const style: React.CSSProperties = {
    gridRow: d.gridRow,
    gridColumn: d.gridColumn,
    background: c.bg,
    // 编辑态**不能**用更粗的边框：2px vs 1px 会把整块内容往下推 1px，进出编辑时所有字都跳一下。
    // 永远 1px，加粗的观感交给 box-shadow（阴影不参与布局）—— 都在 orderFrame 里
    border: frame.border,
    boxShadow: frame.boxShadow,
    color: c.text,
  };
  // 选中时：放编辑控件的那一段被当场画的编辑框盖住（InstantAssign 把它藏起来）；
  // 别的段（日期不连续、被带子切开的）只跟着亮框、不放内容 —— 跟原来服务端画的分配态一样，
  // 不然页面上一单的名字会出现好几遍，哪个是能改的看不出来
  const showDetail = d.showDetail && !selected;
  return (
    <Link
      data-order-id={d.orderId}
      data-order-start={d.orderStart}
      // 点下去那一刻，客户端要立刻拿它拼出分配浮动条的标题 ——
      // 从色块的文字里猜太脆，直接把服务端用的那份原样带上
      // 抢画那条假条要照着它决定放不放备注框 —— 真条只在
      // 「这单还没备注」时才有那个框，不跟着的话接管那一刻整条会横着跳
      data-order-has-note={d.note ? "1" : undefined}
      // 放编辑控件的那一段：点下去当场画分配态时，藏的是这一段（InstantAssign）
      data-edit-seg={d.editSeg ? "1" : undefined}
      data-order-label={d.label}
      href={d.href}
      // 不预取：点色块不导航（InstantAssign 在浏览器里进分配态），预取一次就是白让服务端
      // 整页渲染一遍 —— 1800 个色块，鼠标扫过去一路都在预取（e2e「点一下不发请求」抓到的）
      prefetch={false}
      // 按住拖是「挪到别的日子」（DragMove），不是浏览器原生的「把链接拖出去」
      draggable={false}
      style={{
        ...BLOCK_BASE_STYLE,
        ...style,
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      title={d.title}
    >
      {showDetail && (
        <>
          {/* 第 1 行左边「姓名 · 地点」，右上角放备注（有才显示）：
              金额挪到第 3 行右下角了。格子窄的时候（一天的单子只有
              一列宽）两边都截断，备注最多占一半，剩下的留给名字。 */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: 500,
                minWidth: 0,
              }}
            >
              {d.customerName}
              {d.location ? (
                <span
                  title={d.locationHint || undefined}
                  style={
                    d.badLocation
                      ? {
                          fontWeight: 500,
                          color: "var(--danger)",
                          textDecoration: "underline wavy var(--danger)",
                          textUnderlineOffset: 2,
                        }
                      : { fontWeight: 400, opacity: 0.7 }
                  }
                >
                  {` · ${d.location}`}
                </span>
              ) : null}
            </span>
            {/* 弹簧：把右边那一组顶到右边。**两个状态都放这一个**，
                位置就只由「右边那组各自多宽」决定 —— 分配态中间多出来
                一个状态框时，弹簧自己缩掉，备注和金额一像素都不挪 */}
            <span style={{ flex: "1 1 0", minWidth: 0 }} />
            {d.note ? (
              <span
                style={{
                  maxWidth: "50%",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: 11,
                  fontWeight: 400,
                  opacity: 0.75,
                }}
              >
                {d.note}
              </span>
            ) : null}
            {/* 金额挪到右上角。$ 用跟分配态同一个 class：
                色块窄到一定程度时两边一起藏，不然进出编辑一个有一个没有 */}
            <span style={MONEY_SLOT}>
              <span className="assign-money-sign">$</span>
              {d.amount ?? "?"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              fontSize: 11,
              overflow: "hidden",
            }}
          >
            <span
              data-need="1"
              style={{
                fontWeight: 500,
                color: d.need.isComplete ? "var(--ok)" : "var(--warn)",
                whiteSpace: "nowrap",
                // **不许被压。**「要几个资源、配了几张」是这一格里
                // 最该先看见的东西。挤不下时该让的是右边的物主名字，
                // 不是把「女1/1」截成「女…」——那等于把最关键的信息砍了。
                // 分配态那边本来就是 flexShrink:0，这边跟上
                flexShrink: 0,
              }}
            >
              {/* 不用 formatNeed 拼字符串：分母要单独套进 COUNT_BOX，
                  跟分配态那个输入框占一样宽，进出编辑这行才不动 */}
              {d.need.maleNeeded === 0 && d.need.femaleNeeded === 0 ? (
                "-"
              ) : (
                <>
                  {d.need.maleNeeded > 0 && (
                    <>
                      男{d.need.maleFilled}/
                      <span style={COUNT_BOX}>{d.need.maleNeeded}</span>
                    </>
                  )}
                  {d.need.femaleNeeded > 0 && (
                    <span
                      style={{
                        // 跟分配态那个 flex gap 同一个数
                        marginLeft: d.need.maleNeeded > 0 ? COUNT_GAP : 0,
                      }}
                    >
                      女{d.need.femaleFilled}/
                      <span style={COUNT_BOX}>{d.need.femaleNeeded}</span>
                    </span>
                  )}
                </>
              )}
            </span>
          <div
            style={{
              // 靠右：跟分配态那一份同一个锚。左边留给「男x/x 女x/x」
              marginLeft: "auto",
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: 11,
              opacity: 0.85,
            }}
          >
            {d.cards.length > 0
              ? d.cards.map((s, i) => {
                  const clash = s.clashTitle;
                  return (
                    <span
                      key={s.id}
                      // 给几何测试当锚点：原来量的是「♀」那个字符，
                      // 符号去掉之后得有别的东西钉住「卡片这一段挪没挪」
                      data-card="1"
                      // 冲突的资源标红：这个资源同一天还配在别的单上，
                      // 核验那儿只有一个人能过，必须有人去改
                      style={
                        clash
                          ? {
                              color: "var(--danger)",
                              fontWeight: 600,
                              textDecoration:
                                "underline wavy var(--danger)",
                              textUnderlineOffset: 2,
                            }
                          : undefined
                      }
                      title={
                        clash
                          ? clash
                          : undefined
                      }
                    >
                      {i > 0 ? " " : ""}
                      {s.label}
                    </span>
                  );
                })
              : "未分配"}
          </div>
          </div>
        </>
      )}
    </Link>
  );
}
