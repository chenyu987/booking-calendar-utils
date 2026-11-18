import { describe, expect, it } from "vitest";
import {
  applyPatchToBlock,
  applyPatchToEditor,
  patchFromChanges,
  settledPatches,
  type PendingPatch,
} from "@/app/admin/overview/blockPatch";
import type { BlockData } from "@/app/admin/overview/OrderBlock";
import type { EditorData } from "@/app/admin/overview/AssignEditor";

// 退出分配态时「改过的字段」先画上去，写库在后台。服务端数据回来之前色块显示的就是这份。

const block: BlockData = {
  orderId: "o1",
  orderStart: "2026-01-10",
  href: "/admin/overview?assign=o1",
  gridRow: 3,
  gridColumn: "1 / span 2",
  status: "created",
  adminColor: null,
  title: "",
  label: "小雨 · locaa",
  showDetail: true,
  editSeg: true,
  customerName: "小雨",
  location: "locaa",
  locationHint: "",
  badLocation: false,
  note: "",
  amount: 160,
  need: { maleNeeded: 1, femaleNeeded: 0, maleFilled: 1, femaleFilled: 0, isComplete: true },
  cards: [],
};

describe("patchFromChanges：save-field 的字段 → 补丁", () => {
  it("只带改了的，人数转成数字", () => {
    expect(patchFromChanges({ status: "complete", male_count: "2", female_count: "1" })).toEqual({
      status: "complete",
      maleCount: 2,
      femaleCount: 1,
    });
  });
});

describe("applyPatchToBlock：色块当场显示新值", () => {
  it("改名字、地点、状态、备注、金额：显示的跟着变，浮动条标题也跟着变", () => {
    const d = applyPatchToBlock(block, { customerName: "小雨2", location: "akaad", status: "complete", note: "爽约", amount: "200" });
    expect(d).toMatchObject({ customerName: "小雨2", location: "akaad", status: "complete", note: "爽约", amount: "200", label: "小雨2 · akaad" });
  });

  it("**加了一个人：分配进度跟着变成没配齐**（已配的张数不变）", () => {
    const d = applyPatchToBlock(block, { femaleCount: 1 });
    expect(d.need).toMatchObject({ femaleNeeded: 1, femaleFilled: 0, isComplete: false });
  });

  it("地点名改成认不出来的：标红提示跟着出来", () => {
    const d = applyPatchToBlock(block, { location: "zzz不存在的地点" });
    expect(d.badLocation).toBe(true);
    expect(d.locationHint).not.toBe("");
  });

  it("改了是谁的单：边框颜色当场换；换回主要管理员（null）也换得回去", () => {
    expect(applyPatchToBlock(block, { adminId: "a2", adminColor: "var(--admin-1)" }).adminColor).toBe("var(--admin-1)");
    expect(applyPatchToBlock({ ...block, adminColor: "var(--admin-1)" }, { adminId: "a1", adminColor: null }).adminColor).toBeNull();
  });

  it("不改原来那份（服务端的数据还得留着撤回用）", () => {
    applyPatchToBlock(block, { customerName: "x", maleCount: 3 });
    expect(block.customerName).toBe("小雨");
    expect(block.need.maleNeeded).toBe(1);
  });
});

describe("applyPatchToEditor：退出后马上又点开这一单，编辑框里是新值", () => {
  it("人数改了，缺口跟着重算", () => {
    const ed = { customerName: "小雨", location: "locaa", maleCount: 1, femaleCount: 0, need: { maleFilled: 1, femaleFilled: 0, maleGap: 0, femaleGap: 0 } } as unknown as EditorData;
    const d = applyPatchToEditor(ed, { femaleCount: 2, customerName: "小雨2" });
    expect(d).toMatchObject({ customerName: "小雨2", femaleCount: 2, need: { femaleGap: 2, maleGap: 0 } });
  });
});

describe("applyPatchToEditor：改了是谁的单", () => {
  it("下拉显示新的人，分配态边框换成他的颜色（光圈照旧）", () => {
    const ed = { adminId: "a1", style: { border: "1px solid var(--link)" }, cardBorder: "#ccc", need: {} } as unknown as EditorData;
    const d = applyPatchToEditor(ed, { adminId: "a2", adminColor: "var(--admin-1)" });
    expect(d.adminId).toBe("a2");
    expect(d.style.border).toBe("1px solid var(--admin-1)");
    expect(String(d.style.boxShadow)).toContain("var(--link)");
  });
});

describe("settledPatches：什么时候撤补丁", () => {
  const m = (savedAt: number | null) => new Map<string, PendingPatch>([["o1", { patch: { status: "complete" }, savedAt }]]);
  it("存完之后才开始的渲染到了：撤", () => {
    expect(settledPatches(m(1000), 1001)).toEqual(["o1"]);
  });
  it("**存之前就开始查库的渲染：不撤** —— 它拿的是旧值", () => {
    expect(settledPatches(m(1000), 999)).toEqual([]);
    expect(settledPatches(m(1000), 1000)).toEqual([]);
  });
  it("还没存完：不撤；读不到渲染时间：不撤", () => {
    expect(settledPatches(m(null), Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(settledPatches(m(1000), null)).toEqual([]);
  });
});

describe("少一个人：退回去的资源当场从色块上去掉", () => {
  const patch = { maleCount: 1, femaleCount: 0, amount: "80", droppedCards: [{ id: "s-f", gender: "female" }] };

  it("普通态：资源没了、女的已配张数减一，还是配齐", () => {
    const b: BlockData = {
      ...block,
      need: { maleNeeded: 1, femaleNeeded: 1, maleFilled: 1, femaleFilled: 1, isComplete: true },
      cards: [
        { id: "s-m", label: "Evan", clashTitle: "" },
        { id: "s-f", label: "Elaine", clashTitle: "" },
      ],
    };
    const d = applyPatchToBlock(b, patch);
    expect(d.cards.map((c) => c.id)).toEqual(["s-m"]);
    expect(d.need).toMatchObject({ femaleFilled: 0, femaleNeeded: 0, isComplete: true });
    expect(d.amount).toBe("80");
  });

  it("分配态：资源没了、缺口按新人数算", () => {
    const ed = {
      maleCount: 1,
      femaleCount: 1,
      need: { maleFilled: 1, femaleFilled: 1, maleGap: 0, femaleGap: 0 },
      cards: [
        { id: "s-m", label: "Evan", clash: false, gender: "male" },
        { id: "s-f", label: "Elaine", clash: false, gender: "female" },
      ],
    } as unknown as EditorData;
    const d = applyPatchToEditor(ed, patch);
    expect(d.cards.map((c) => c.id)).toEqual(["s-m"]);
    expect(d).toMatchObject({ femaleCount: 0, need: { femaleFilled: 0, femaleGap: 0, maleGap: 0 } });
  });
});

describe("settledPatches：实时更新单独拉回某一单", () => {
  const two = new Map([
    ["o1", { patch: {}, savedAt: 1000 }],
    ["o2", { patch: {}, savedAt: 1000 }],
  ]) as any;
  it("拉回 o1（晚于存完）只撤 o1 的补丁，o2 还没拉回来就留着", () => {
    expect(settledPatches(two, 500, new Map([["o1", 1500]]))).toEqual(["o1"]);
  });
  it("整页渲染够新照样都撤", () => {
    expect(settledPatches(two, 2000, new Map()).sort()).toEqual(["o1", "o2"]);
  });
});
