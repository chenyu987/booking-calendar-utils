import { describe, it, expect } from "vitest";
import { groupMatchesByOrder, parseMatchView } from "./matchGroup";

const m = (id: string, order_id: string) => ({ id, order_id });

describe("parseMatchView", () => {
  // 默认日历：匹配是按日期做的决定
  it("没给参数就是日历", () => {
    expect(parseMatchView(undefined)).toBe("calendar");
    expect(parseMatchView("")).toBe("calendar");
  });

  it("明写 flat / order 才切过去", () => {
    expect(parseMatchView("flat")).toBe("flat");
    expect(parseMatchView("order")).toBe("order");
  });

  it("认不出来的值一律当没给 —— 回默认，不报错", () => {
    expect(parseMatchView("乱填")).toBe("calendar");
  });
});

describe("groupMatchesByOrder", () => {
  it("同一单的收到一组里", () => {
    const g = groupMatchesByOrder([m("a", "o1"), m("b", "o1"), m("c", "o2")]);
    expect(g).toHaveLength(2);
    expect(g[0].matches.map((x) => x.id)).toEqual(["a", "b"]);
    expect(g[1].matches.map((x) => x.id)).toEqual(["c"]);
  });

  // 外面按什么排，这里就还是什么顺序 —— 自己再排一次的话，
  // 切换视图顺序就变了，同一批东西看着像两批
  it("分组顺序 = 每个订单第一次出现的顺序，不自己重排", () => {
    const g = groupMatchesByOrder([m("a", "o2"), m("b", "o1"), m("c", "o2")]);
    expect(g.map((x) => x.orderId)).toEqual(["o2", "o1"]);
  });

  it("不相邻的同一单也收得到一起", () => {
    const g = groupMatchesByOrder([m("a", "o1"), m("b", "o2"), m("c", "o1")]);
    expect(g[0].matches.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("first 是这一单第一条 —— 订单信息从它身上带", () => {
    const g = groupMatchesByOrder([m("a", "o1"), m("b", "o1")]);
    expect(g[0].first.id).toBe("a");
  });

  it("空的就是空的", () => {
    expect(groupMatchesByOrder([])).toEqual([]);
  });
});
