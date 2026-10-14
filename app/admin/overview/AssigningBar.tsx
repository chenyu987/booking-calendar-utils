"use client";

import Link from "next/link";
import DeleteOrderButton from "./DeleteOrderButton";
import { AssignByNameInput } from "./AssignActions";
import NoteInput from "./NoteInput";

/**
 * 分配模式的浮动操作条。
 *
 * 删除订单原来是色块右下角一个红叉，有两个毛病：
 *   1. 一天的单子只有一列宽，色块 overflow:hidden，红叉直接被裁掉 —— 想删都删不了
 *   2. 就算看得见，它也在跟金额抢那点本来就不够的地方
 *
 * 所以整个挪出来。色块里一个像素都不占，一天的单子也删得掉。
 * 位置跟批量改状态那条一样贴顶：眼睛盯着日历时，底部的东西根本注意不到。
 */
export default function AssigningBar({
  orderId,
  label,
  note,
  candidates,
  deleteAction,
  exitHref,
  instant = false,
  onDelete,
}: {
  orderId: string;
  label: string;
  note: string;
  candidates: { id: string; name: string; hint: string }[];
  deleteAction: (formData: FormData) => Promise<void>;
  exitHref: string;
  /** 点下去当场画的那一份（InstantAssign），服务端那份到了就撤 */
  instant?: boolean;
  /** 确认删除这单的那一刻：退出分配态、不存改动（InstantAssign） */
  onDelete?: () => void;
}) {
  return (
    <div
      // 给「点下去先假装已经进分配模式」那层认的。
      // **必须带上单号**：在分配态里点另一单时，旧那一单的真条还挂在 DOM 上，
      // 只判断「有没有真条」的话，抢画的假状态一挂上就被立刻撤掉 ——
      // 等于换单的时候完全没有即时反馈，干等一次整页重渲染
      data-assign-bar={orderId}
      data-instant={instant ? "1" : undefined}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: 8,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--link)",
        color: "var(--on-solid)",
        borderRadius: 6,
        padding: "6px 10px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        fontSize: 12,
        maxWidth: "90vw",
      }}
    >
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        正在分配：{label}
      </span>

      {/* 输入物主名字直接分配 —— 不用非得到左边一长串里去找去点。
          放在这条上而不是色块里：色块里那个几十像素宽的输入框，
          今天已经因为下拉误触改坏过两次数据 */}
      <span style={{ flexShrink: 0 }}>
        <AssignByNameInput orderId={orderId} candidates={candidates} />
      </span>

      {/* **只有这单还没备注的时候**才在这儿加。
          已经有备注的就在色块里直接改 —— 那时候它本来就显示在那儿，
          就地改最顺手，挤一点也认了。
          空着的输入框才是真浪费：多数单子没有备注，却让每个资源的编辑态
          常年挤着一个空框，还把姓名地点往里压。
          两处永远只出现一个，也就不会有「两个地方编辑同一个字段、
          谁覆盖谁」的问题 */}
      {!note && (
        <span style={{ flexShrink: 0 }}>
          <NoteInput orderId={orderId} defaultValue="" />
        </span>
      )}

      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <DeleteOrderButton
          orderId={orderId}
          deleteAction={deleteAction}
          exitHref={exitHref}
          onStart={onDelete}
          style={{
            width: "auto",
            padding: "2px 8px",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius: 4,
            background: "transparent",
            color: "var(--on-solid)",
            fontSize: 12,
            lineHeight: 1.4,
          }}
          label="删除这单"
        />
      </span>

      <Link
        href={exitHref}
        style={{
          color: "var(--on-solid)",
          opacity: 0.85,
          textDecoration: "none",
          flexShrink: 0,
          fontSize: 12,
        }}
      >
        完成
      </Link>
    </div>
  );
}
