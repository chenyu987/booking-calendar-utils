import { Fragment } from "react";
import Link from "next/link";
import { formatDayRanges } from "@/lib/dates";
import { formatHolder } from "@/lib/age";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  formatValidity,
  isExpired,
} from "@/lib/resourceStatus";
import { resourcePeriods } from "@/lib/validity";
import { saveResource, deleteResource } from "./actions";

// 「我的」里的资源那一段：每个资源一张小卡片，点编辑就地改。
// 编辑态用 URL 参数切换，不用 useState —— 跟 admin 那几个列表页一个路子。
export default function ResourceList({
  resources,
  bookedDays,
  editing,
  deleting,
  openMatchCount,
  errorText,
}: {
  resources: any[];
  bookedDays: Map<string, string[]>;
  editing?: string;
  /** 正在确认删除 —— 走 ?edit=<id>&delete=1，跟编辑态一样是 URL 参数 */
  deleting?: boolean;
  /** 这个资源上还挂着几条没结的意向，删了会一起没 */
  openMatchCount?: number;
  errorText: string | null;
}) {
  if (resources.length === 0) {
    return (
      <p style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 14 }}>
        你还没挂过资源，点上面那个按钮挂一个。
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {resources.map((s: any) => {
        const booked = [...new Set(bookedDays.get(s.id) ?? [])].sort();
        if (editing === s.id) {
          return (
            <ResourceEditForm
              key={s.id}
              resource={s}
              booked={booked}
              deleting={Boolean(deleting)}
              openMatchCount={openMatchCount ?? 0}
              errorText={errorText}
            />
          );
        }
        return (
          <div key={s.id} style={cardStyle}>
            <div style={rowStyle}>
              <span style={{ fontWeight: 500 }}>
                {s.holder_name || "（没填持有人）"}
                <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>
                  {" "}
                  {formatHolder(s.holder_gender, s.holder_date_of_birth)}
                </span>
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.item_type ?? "-"}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              有效期 {formatValidity(s)}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {booked.length > 0 ? (
                <span style={{ color: "var(--ok)" }}>
                  已排 {formatDayRanges(booked)}（共 {booked.length} 天）
                </span>
              ) : (
                <span style={{ color: "var(--text-faint)" }}>还没排出去</span>
              )}
            </div>
            <div style={{ ...rowStyle, fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
              <span>
                {RESOURCE_STATUS_LABELS[s.status] ?? s.status}
                {isExpired(s) && <span style={{ color: "var(--warn)" }}> · 已过有效期</span>}
              </span>
              <Link href={`/provider?edit=${s.id}`} style={{ fontSize: 13, color: "var(--link)" }}>
                编辑
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 编辑态。已经排出去的资源有两处受限：性别不给改、有效期不能缩到盖不住已排的日子。
// 界面上禁掉/给 min-max 只是省得白填一遍，真正拦住的是 saveResource 里那道校验。
function ResourceEditForm({
  resource: s,
  booked,
  deleting,
  openMatchCount,
  errorText,
}: {
  resource: any;
  booked: string[];
  deleting: boolean;
  openMatchCount: number;
  errorText: string | null;
}) {
  const hasBooked = booked.length > 0;
  const periods = resourcePeriods(s);

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, margin: "0 0 8px", color: "var(--text-muted)" }}>改资源信息</h3>
      {errorText && <p style={errorStyle}>{errorText}</p>}

      <form action={saveResource} style={formStyle}>
        <input type="hidden" name="id" value={s.id} />

        <label style={labelStyle}>
          类型
          <select name="item_type" defaultValue={s.item_type ?? "beta"} style={inputStyle}>
            <option value="beta">Beta</option>
            <option value="alpha">Alpha</option>
          </select>
        </label>

        <label style={labelStyle}>
          资源上的名字
          <input name="holder_name" required defaultValue={s.holder_name ?? ""} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          持有人性别
          {hasBooked ? (
            <>
              {/* 禁掉的控件不会提交，所以值另走一个 hidden —— 不然一保存性别就空了 */}
              <input type="hidden" name="holder_gender" value={s.holder_gender ?? ""} />
              <select
                disabled
                defaultValue={s.holder_gender ?? ""}
                style={{ ...inputStyle, color: "var(--text-faint)" }}
              >
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </>
          ) : (
            <select name="holder_gender" required defaultValue={s.holder_gender ?? ""} style={inputStyle}>
              <option value="" disabled>
                选一个
              </option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          )}
        </label>
        {hasBooked && (
          <p style={hintStyle}>
            这个资源已经排出去了，性别不能改 —— 客户是按性别配的，物品登记了使用人，
            核验时得对得上人。要改先联系我们。
          </p>
        )}

        <label style={labelStyle}>
          持有人生日
          <input
            name="holder_date_of_birth"
            type="date"
            defaultValue={s.holder_date_of_birth ?? ""}
            style={inputStyle}
          />
        </label>

        {/* 有效期可能有好几段（lib/validity.ts），一段一对。只有一段时才用 min/max
            提示「得盖住已排的日子」—— 好几段时哪天归哪段说不清，交给服务端校验 */}
        {periods.map((p, i) => (
          <Fragment key={i}>
            <label style={labelStyle}>
              有效期开始{periods.length > 1 ? `（第 ${i + 1} 段）` : ""}
              <input
                name="date_range_start"
                type="date"
                max={hasBooked && periods.length === 1 ? booked[0] : undefined}
                defaultValue={p.start ?? ""}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              有效期结束{periods.length > 1 ? `（第 ${i + 1} 段）` : ""}
              <input
                name="date_range_end"
                type="date"
                min={hasBooked && periods.length === 1 ? booked[booked.length - 1] : undefined}
                defaultValue={p.end ?? ""}
                style={inputStyle}
              />
            </label>
          </Fragment>
        ))}
        <p style={hintStyle}>
          两头都选填，留空就是这一头不设限 —— 整季通用的资源两个都空着。
        </p>
        {hasBooked && (
          <p style={hintStyle}>
            已经排出去 {formatDayRanges(booked)}，填了的那一头得把这几天盖住。
          </p>
        )}

        <label style={labelStyle}>
          状态
          <select name="status" defaultValue={s.status} style={inputStyle}>
            {RESOURCE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {RESOURCE_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <p style={hintStyle}>
          暂停和下架只管「接不接新单」，已经排出去的那几天照常生效。
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={buttonStyle}>
            保存
          </button>
          <Link href="/provider" style={cancelStyle}>
            取消
          </Link>
        </div>
      </form>

      {/* 删除入口放在最下面、字很小 —— 它跟「保存」不是一个量级的动作。
          **已经排出去的资源根本不给入口**，而且服务端也拦着（deleteBlockReason）。 */}
      <div style={deleteAreaStyle}>
        {hasBooked ? (
          <p style={hintStyle}>
            这个资源已经排出去了，删不了 —— 删掉会把分配记录一起带走，订单那边还显示
            配好了资源。不想再出租的话，把上面的状态改成「暂停」或「已下架」就行，
            已经排出去的那几天照常生效。
          </p>
        ) : deleting ? (
          <div style={dangerBoxStyle}>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.7 }}>
              删掉 <b>{s.holder_name || "这个资源"}</b>？删了你这边就看不到它了，
              你自己没法再恢复 —— 挂错了要改回来得找我们。
              {openMatchCount > 0 && (
                <>
                  {" "}
                  你在这个资源上提过的 <b>{openMatchCount}</b> 条意向也会一起没。
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <form action={deleteResource}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" style={dangerButtonStyle}>
                  确认删除
                </button>
              </form>
              <Link href={`/provider?edit=${s.id}`} style={{ fontSize: 13, color: "var(--text-muted)" }}>
                取消
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Link href={`/provider?edit=${s.id}&delete=1`} style={deleteLinkStyle}>
              删除这个资源
            </Link>
            <p style={{ ...hintStyle, marginTop: 4 }}>
              挂错了才用它。只是暂时不租的话，把上面的状态改成「暂停」。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const deleteAreaStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 10,
  borderTop: "1px solid var(--border)",
};
const deleteLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--danger)",
  textDecoration: "none",
};
const dangerBoxStyle: React.CSSProperties = {
  border: "1px solid var(--danger-soft-border)",
  background: "var(--danger-soft-bg)",
  borderRadius: 6,
  padding: "10px 12px",
};
const dangerButtonStyle: React.CSSProperties = {
  padding: "7px 14px",
  border: "none",
  background: "var(--danger)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "10px 12px",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
};
const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "var(--text-muted)",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-faint)",
  margin: 0,
  lineHeight: 1.6,
};
const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--danger)",
  margin: "0 0 8px",
  lineHeight: 1.6,
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
const cancelStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 14,
  color: "var(--text-muted)",
  textDecoration: "none",
};
