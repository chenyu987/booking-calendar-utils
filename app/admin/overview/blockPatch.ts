import { isUnknownLocation, locationHintFor } from "@/lib/locations";
import { statusColor } from "@/lib/orderStatus";
import { orderFrame } from "@/lib/orderFrame";
import type { BlockData } from "./OrderBlock";
import type { EditorData } from "./AssignEditor";

// 退出分配态时「改过的字段」先画上去：色块当场显示新值，写库在后台（InstantAssign）。
// 纯函数，服务端那份数据回来之前用它把改动盖在上面（tests/blockPatch.test.ts）。
//
// **什么时候撤**：不是「看见色块上的值跟改的一样了」—— 那样别人（或者多选批量改）
// 后来又改成别的，补丁就永远撤不掉。而是「**存完之后才开始查库的那一次渲染**已经到了」：
// 那次渲染的数据一定包含这次写入，不管显示的是什么都是真的。两头的时间都是服务端的
// （save-field 回的 at、页面 main 上的 data-rendered-at），不拿浏览器的钟去比。

/** 改过的字段（只放改了的）。跟 save-field 收的是同一批 */
export type FieldPatch = {
  customerName?: string;
  location?: string;
  status?: string;
  note?: string;
  amount?: string;
  maleCount?: number;
  femaleCount?: number;
  /** 这一单改成谁的（orders.admin_id） */
  adminId?: string;
  /**
   * 改了是谁的之后边框换成什么颜色（lib/orderFrame.ts 的 frameColor，null = 跟状态色）。
   * 要 admins 名单才算得出来，所以不在 patchFromChanges 里算，由 InstantAssign 填
   */
  adminColor?: string | null;
};

/** collectChangedEdits 收出来的那份（save-field 的字段名）→ 补丁 */
export function patchFromChanges(changes: Record<string, string>): FieldPatch {
  const p: FieldPatch = {};
  if (changes.customer_name !== undefined) p.customerName = changes.customer_name.trim();
  if (changes.location !== undefined) p.location = changes.location.trim();
  if (changes.status !== undefined) p.status = changes.status;
  if (changes.note !== undefined) p.note = changes.note.trim();
  if (changes.amount !== undefined) p.amount = changes.amount;
  if (changes.male_count !== undefined) p.maleCount = Number(changes.male_count);
  if (changes.female_count !== undefined) p.femaleCount = Number(changes.female_count);
  if (changes.admin_id !== undefined) p.adminId = changes.admin_id;
  return p;
}

function locationFields(location: string) {
  const bad = isUnknownLocation(location || null);
  return { badLocation: bad, locationHint: bad ? locationHintFor(location) : "" };
}

/** 普通态色块盖上补丁 */
export function applyPatchToBlock(d: BlockData, p: FieldPatch): BlockData {
  const out: BlockData = { ...d, need: { ...d.need } };
  if (p.customerName !== undefined) out.customerName = p.customerName;
  if (p.location !== undefined) Object.assign(out, { location: p.location || null }, locationFields(p.location));
  if (p.status !== undefined) out.status = p.status;
  if (p.note !== undefined) out.note = p.note;
  if (p.amount !== undefined) out.amount = p.amount === "" ? null : p.amount;
  if (p.adminColor !== undefined) out.adminColor = p.adminColor;
  // 人数就是「要几个资源」的分母；配齐没有跟着重算（已配的张数不变）
  if (p.maleCount !== undefined) out.need.maleNeeded = p.maleCount;
  if (p.femaleCount !== undefined) out.need.femaleNeeded = p.femaleCount;
  out.need.isComplete =
    out.need.maleFilled >= out.need.maleNeeded && out.need.femaleFilled >= out.need.femaleNeeded;
  if (p.customerName !== undefined || p.location !== undefined) {
    out.label = [out.customerName, out.location].filter(Boolean).join(" · ");
  }
  return out;
}

/** 分配态（再点开这一单时）盖上补丁：输入框的初始值和 data-original 都是新值 —— 那就是库里马上会有的 */
export function applyPatchToEditor<T extends EditorData>(d: T, p: FieldPatch): T {
  const out: T = { ...d, need: { ...d.need } };
  if (p.customerName !== undefined) out.customerName = p.customerName;
  if (p.location !== undefined) Object.assign(out, { location: p.location }, locationFields(p.location));
  if (p.status !== undefined) {
    out.status = p.status;
    // 底色、文字色、撤销分配那个叉的底色跟着状态走；边框是分配态的蓝（或管理员色），跟状态无关
    const c = statusColor(p.status);
    out.style = { ...out.style, background: c.bg, color: c.text };
    out.cardBg = c.bg;
    out.cardBorder = c.border;
  }
  if (p.note !== undefined) out.note = p.note;
  if (p.amount !== undefined) out.amount = p.amount === "" ? null : p.amount;
  if (p.maleCount !== undefined) {
    out.maleCount = p.maleCount;
    out.need.maleGap = Math.max(0, p.maleCount - out.need.maleFilled);
  }
  if (p.femaleCount !== undefined) {
    out.femaleCount = p.femaleCount;
    out.need.femaleGap = Math.max(0, p.femaleCount - out.need.femaleFilled);
  }
  if (p.adminId !== undefined) out.adminId = p.adminId;
  if (p.adminColor !== undefined) {
    // 分配态的边框光圈跟普通态同一处算（orderFrame），只是 assigning
    out.style = { ...out.style, ...orderFrame({ statusBorder: out.cardBorder, adminColor: p.adminColor, assigning: true }) };
  }
  return out;
}

export type PendingPatch = {
  patch: FieldPatch;
  /** save-field 写完那一刻的服务端时间（ms）；还没存完是 null —— 没存完的永远不撤 */
  savedAt: number | null;
};

/** 哪些补丁可以撤了：存完了，而且页面上这一次渲染是存完之后才开始查库的 */
export function settledPatches(
  pending: ReadonlyMap<string, PendingPatch>,
  renderedAt: number | null
): string[] {
  if (renderedAt === null || !Number.isFinite(renderedAt)) return [];
  return [...pending]
    .filter(([, p]) => p.savedAt !== null && renderedAt > p.savedAt)
    .map(([id]) => id);
}
