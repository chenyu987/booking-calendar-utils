"use client";

import Link from "next/link";
import DeleteOrderButton from "./DeleteOrderButton";
import { AssignByNameInput } from "./AssignActions";
import NoteInput from "./NoteInput";
import type { Admin } from "@/lib/admins";
import type { DropOption } from "@/lib/dropPerson";
import MoreMenu from "./MoreMenu";

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
  admins = [],
  adminId = null,
  onAdminChange,
  dropOptions = [],
  onDropPerson,
  party = 0,
  amount = null,
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
  /** 「谁的单」下拉（orders.admin_id）。没传 onAdminChange 就不显示 */
  admins?: Admin[];
  /** 这一单现在算谁的（没写的算主要管理员） */
  adminId?: string | null;
  onAdminChange?: (adminId: string) => void;
  /** 「⋯」菜单里「少几个人」能勾的那几个人（lib/dropPerson.ts 的 dropPersonOptions）；没传 onDropPerson 就不显示 */
  dropOptions?: DropOption[];
  onDropPerson?: (opts: DropOption[]) => void;
  /** 现在几个人、总价：「⋯」里至少留一个人、确定按钮上显示减完多少钱 */
  party?: number;
  amount?: number | string | null;
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

      {/* 这一单是谁的（2026-11-11 加的）：比如 Admin1 接的单转给 admin2。
          只改这一单的归属，不动客人挂在谁名下（person_contacts）—— 那是「哪个账号加的」，
          在 Customer 管理里勾 */}
      {onAdminChange && admins.length > 0 && (
        <select
          aria-label="谁的单"
          title="这一单是谁的"
          value={adminId ?? ""}
          onChange={(e) => e.target.value && onAdminChange(e.target.value)}
          style={{
            flexShrink: 0,
            fontSize: 12,
            padding: "3px 4px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.12)",
            color: "var(--on-solid)",
          }}
        >
          {!adminId && (
            <option value="" disabled>
              谁的单
            </option>
          )}
          {admins.map((a) => (
            // 下拉展开的那张列表是系统画的白底，option 跟着上面的白字就看不见了
            <option key={a.id} value={a.id} style={{ color: "var(--text)", background: "var(--bg)" }}>
              {a.name} 的单
            </option>
          ))}
        </select>
      )}

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

      {/* 不常用的快捷操作收在「⋯」里（2026-11-17 加的，第一项是少几个人），别再往条上平铺 */}
      {onDropPerson && <MoreMenu options={dropOptions} party={party} amount={amount} onPick={onDropPerson} />}

      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <DeleteOrderButton
          orderId={orderId}
          deleteAction={deleteAction}
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
