"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { DATE_INPUT_MAX } from "@/lib/dates";
import { resourcePeriods } from "@/lib/validity";
import { RESOURCE_STATUSES, RESOURCE_STATUS_LABELS } from "@/lib/resourceStatus";
import {
  inputStyle,
  selectStyle,
  buttonStyle,
  rowStyle,
  cellStyle,
  linkButtonStyle,
} from "@/lib/adminStyles";
import { VALIDITY_WIDTH, rangeInputStyle, tildeStyle, PROVIDER_COL, HOLDER_COL, BOOKING_COL, ADDRESS_COL, ITEM_WIDTH, CONTACT_WIDTH } from "./styles";
import { ITEM_KINDS, ITEM_KIND_LABELS, itemKind } from "@/lib/itemKind";
import HolderPhotoUpload from "./HolderPhotoUpload";
import { saveResource } from "./actions";

// Resource 管理的编辑态在浏览器里切，不走服务端。
//
// 原来「编辑」是个链接（?edit=<id>），点一下服务端把两百多个资源的整张表重画一遍，2~6 秒；
// 每个「编辑」链接还被 Next 预取，一打开页面就是两百多个请求。现在点「编辑」当场把那一行
// 换成表单，「取消」当场换回来，只有「保存」要跟服务端说话（actions.ts 的 saveResource）。
//
// 地址栏上照样写 ?edit=<id>（history.replaceState，不触发导航）：刷新还停在编辑态，
// 排期总览那边双击卡片跳过来（/admin/resources?edit=<id>）也照样直接进编辑态。

type Provider = { id: string; name: string };
type Ctx = { editingId: string | null; open: (id: string) => void; close: () => void; providers: Provider[] };
const EditCtx = createContext<Ctx | null>(null);

function setEditParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("edit", id);
  else url.searchParams.delete("edit");
  window.history.replaceState(window.history.state, "", url);
}

export function ResourceEditProvider({
  initialId,
  providers,
  children,
}: {
  initialId: string | null;
  providers: Provider[];
  children: ReactNode;
}) {
  const [editingId, setEditingId] = useState(initialId);
  const open = (id: string) => {
    setEditingId(id);
    setEditParam(id);
  };
  const close = () => {
    setEditingId(null);
    setEditParam(null);
  };
  return <EditCtx.Provider value={{ editingId, open, close, providers }}>{children}</EditCtx.Provider>;
}

function useEdit() {
  const ctx = useContext(EditCtx);
  if (!ctx) throw new Error("ResourceEditProvider 外面用不了");
  return ctx;
}

export function EditResourceButton({ id }: { id: string }) {
  const { open } = useEdit();
  return (
    <button type="button" onClick={() => open(id)} style={linkButtonStyle}>
      编辑
    </button>
  );
}

export type EditableResource = {
  id: string;
  provider_id: string;
  item_type: string | null;
  item_tier: string | null;
  holder_name: string | null;
  holder_gender: string | null;
  holder_date_of_birth: string | null;
  holder_photo_path: string | null;
  validity: unknown;
  status: string;
};

/** 一行：在编辑这张就换成表单，不然就是服务端画好的展示行（children） */
export function ResourceRow({ resource, children }: { resource: EditableResource; children: ReactNode }) {
  const { editingId } = useEdit();
  return editingId === resource.id ? <ResourceEditForm s={resource} /> : <>{children}</>;
}

function ResourceEditForm({ s }: { s: EditableResource }) {
  const { providers, close } = useEdit();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await saveResource(fd);
          if (r.error) setError(r.error);
          else close();
        })
      }
      style={{ ...rowStyle, position: "relative" }}
      data-editing-resource={s.id}
    >
      <input type="hidden" name="id" value={s.id} />
      <div style={{ ...cellStyle, ...PROVIDER_COL }}>
        <select name="provider_id" defaultValue={s.provider_id} style={{ ...selectStyle, width: "100%" }}>
          {providers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ ...cellStyle, width: ITEM_WIDTH }}>
        <select name="item_kind" defaultValue={itemKind(s) ?? "alpha"} style={{ ...selectStyle, width: "100%" }}>
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {ITEM_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {/* 照片在这一格：选了图马上传（HolderPhotoUpload），不跟「保存」走 */}
      <div style={{ ...cellStyle, ...HOLDER_COL, display: "flex", alignItems: "center", gap: 6 }}>
        <HolderPhotoUpload resourceId={s.id} path={s.holder_photo_path} name={s.holder_name} />
        <input name="holder_name" defaultValue={s.holder_name ?? ""} style={{ ...inputStyle, width: "100%", minWidth: 0 }} />
      </div>
      <div style={{ ...cellStyle, width: 60 }}>
        <select name="holder_gender" defaultValue={s.holder_gender ?? ""} style={{ ...selectStyle, width: "100%" }}>
          <option value="">-</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>
      <div style={{ ...cellStyle, width: 96 }}>
        <input
          name="holder_date_of_birth"
          type="date"
          max={DATE_INPUT_MAX}
          defaultValue={s.holder_date_of_birth ?? ""}
          style={{ ...inputStyle, width: "100%" }}
        />
      </div>
      <div style={{ ...cellStyle, width: 70, color: "var(--text-faint)" }}>自动</div>
      {/* 有效期一段一对输入框，几段就上下叠几行（lib/validity.ts）。
          periodsFromFormData 按 getAll 的顺序配对，一行里先起后止就对得上 */}
      <div style={{ ...cellStyle, width: VALIDITY_WIDTH }}>
        {resourcePeriods(s as any).map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input
              name="date_range_start"
              type="date"
              max={DATE_INPUT_MAX}
              title="空 = 不设下限"
              defaultValue={p.start ?? ""}
              style={{ ...inputStyle, ...rangeInputStyle }}
            />
            <span style={tildeStyle}>~</span>
            <input
              name="date_range_end"
              type="date"
              max={DATE_INPUT_MAX}
              title="空 = 不设上限"
              defaultValue={p.end ?? ""}
              style={{ ...inputStyle, ...rangeInputStyle }}
            />
          </div>
        ))}
      </div>
      <div style={{ ...cellStyle, ...BOOKING_COL, fontSize: 11, color: error ? "var(--danger, crimson)" : "var(--text-faint)" }}>
        {error ?? "排期由订单决定，改不了"}
      </div>
      {/* 地址是物主（人）身上的，不在资源上 —— 在 Provider 管理里改 */}
      <div style={{ ...cellStyle, ...ADDRESS_COL, fontSize: 11, color: "var(--text-faint)" }}>在 Provider 管理里改</div>
      <div style={{ ...cellStyle, width: CONTACT_WIDTH, fontSize: 11, color: "var(--text-faint)" }}>在 Provider 管理里改</div>
      <div style={{ ...cellStyle, width: 110 }}>
        <select name="status" defaultValue={s.status} style={{ ...selectStyle, width: "100%" }}>
          {RESOURCE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {RESOURCE_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </div>
      <div style={{ ...cellStyle, width: 110, display: "flex", gap: 8 }}>
        <button type="submit" disabled={pending} style={buttonStyle}>
          {pending ? "保存中…" : "保存"}
        </button>
        <button type="button" onClick={close} disabled={pending} style={linkButtonStyle}>
          取消
        </button>
      </div>
    </form>
  );
}
