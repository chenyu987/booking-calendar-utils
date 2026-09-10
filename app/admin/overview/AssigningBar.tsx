"use client";

import Link from "next/link";
import DeleteOrderButton from "./DeleteOrderButton";
import { AssignByNameInput } from "./AssignActions";

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
  candidates,
  deleteAction,
  exitHref,
}: {
  orderId: string;
  label: string;
  candidates: { id: string; name: string; hint: string }[];
  deleteAction: (formData: FormData) => Promise<void>;
  exitHref: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: 8,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#1c4e78",
        color: "#fff",
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

      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <DeleteOrderButton
          orderId={orderId}
          deleteAction={deleteAction}
          exitHref={exitHref}
          style={{
            width: "auto",
            padding: "2px 8px",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius: 4,
            background: "transparent",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.4,
          }}
          label="删除这单"
        />
      </span>

      <Link
        href={exitHref}
        style={{
          color: "#fff",
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
