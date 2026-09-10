import { describe, it, expect } from "vitest";
import { previousOrdersFor, type ResourceUse } from "./previousUse";

const uses = (m: Record<string, ResourceUse[]>) => new Map(Object.entries(m));

describe("previousOrdersFor", () => {
  it("找出这个资源上一次用在哪一单", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10", "2026-09-11"],
      ["s1"],
      uses({
        s1: [
          { orderId: "old", days: ["2026-09-05", "2026-09-06"] },
          { orderId: "now", days: ["2026-09-10", "2026-09-11"] },
        ],
      })
    );
    expect([...got]).toEqual(["old"]);
  });

  it("只点亮**最近**那一次，更早的不点", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1"],
      uses({
        s1: [
          { orderId: "ancient", days: ["2026-07-01"] },
          { orderId: "recent", days: ["2026-09-05"] },
          { orderId: "now", days: ["2026-09-10"] },
        ],
      })
    );
    expect([...got]).toEqual(["recent"]);
  });

  it("两个资源落在同一单上 —— 只点一次，不重复", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1", "s2"],
      uses({
        s1: [{ orderId: "old", days: ["2026-09-05"] }],
        s2: [{ orderId: "old", days: ["2026-09-05"] }],
      })
    );
    expect([...got]).toEqual(["old"]);
  });

  it("两个资源上一单不一样 —— 都点亮", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1", "s2"],
      uses({
        s1: [{ orderId: "oldA", days: ["2026-09-05"] }],
        s2: [{ orderId: "oldB", days: ["2026-09-01"] }],
      })
    );
    expect([...got].sort()).toEqual(["oldA", "oldB"]);
  });

  it("资源是头一次用 —— 不点亮任何单", () => {
    const got = previousOrdersFor("now", ["2026-09-10"], ["s1"], uses({ s1: [] }));
    expect(got.size).toBe(0);
  });

  it("排除自己：这一单自己不该被点亮", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1"],
      uses({ s1: [{ orderId: "now", days: ["2026-09-10"] }] })
    );
    expect(got.size).toBe(0);
  });

  it("**之后**的单子不算上一次", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1"],
      uses({ s1: [{ orderId: "future", days: ["2026-09-20"] }] })
    );
    expect(got.size).toBe(0);
  });

  it("跨过这一单开始日的那种不算 —— 它还在用着，不是「上一次」", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1"],
      uses({ s1: [{ orderId: "spanning", days: ["2026-09-08", "2026-09-12"] }] })
    );
    expect(got.size).toBe(0);
  });

  it("按结束日期比，不按数组顺序 —— 补录的历史单顺序是乱的", () => {
    const got = previousOrdersFor(
      "now",
      ["2026-09-10"],
      ["s1"],
      uses({
        s1: [
          { orderId: "recent", days: ["2026-09-08", "2026-09-06"] },
          { orderId: "older", days: ["2026-09-01"] },
        ],
      })
    );
    expect([...got]).toEqual(["recent"]);
  });

  it("这一单没日期就不点亮 —— 没有「之前」可言", () => {
    const got = previousOrdersFor(
      "now",
      [],
      ["s1"],
      uses({ s1: [{ orderId: "old", days: ["2026-09-05"] }] })
    );
    expect(got.size).toBe(0);
  });
});
