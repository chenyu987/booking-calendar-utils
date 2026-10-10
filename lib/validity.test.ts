import { describe, it, expect } from "vitest";
import {
  OPEN_VALIDITY,
  compareByValidityStart,
  parseValidity,
  periodsFromForm,
  serializeValidity,
  validitySpan,
} from "./validity";
import { coversOrder, formatValidity, isExpired, validityOverlaps } from "./resourceStatus";

// 两季能用、中间那季没续 —— 改成 multirange 就是为了表达这种资源（迁移 0023）
const gapped = { validity: "{[2024-11-01,2025-05-31),[2026-11-01,2027-05-31)}" };

describe("parseValidity", () => {
  it("库里规整过的左闭右开换回含当天的结束日", () => {
    expect(parseValidity("{[2025-11-01,2026-05-31)}")).toEqual([
      { start: "2025-11-01", end: "2026-05-30" },
    ]);
  });

  it("好几段按顺序都读出来", () => {
    expect(parseValidity(gapped.validity)).toEqual([
      { start: "2024-11-01", end: "2025-05-30" },
      { start: "2026-11-01", end: "2027-05-30" },
    ]);
  });

  it("不设限的那一头读成 null", () => {
    expect(parseValidity("{(,)}")).toEqual([{ start: null, end: null }]);
    expect(parseValidity("{[2026-09-07,)}")).toEqual([{ start: "2026-09-07", end: null }]);
    expect(parseValidity("{(,2026-11-27)}")).toEqual([{ start: null, end: "2026-11-26" }]);
  });

  it("没读到这一列当成不限 —— 跟老的两列都空一个意思", () => {
    expect(parseValidity(null)).toEqual(OPEN_VALIDITY);
    expect(parseValidity(undefined)).toEqual(OPEN_VALIDITY);
  });

  it("写出去再读回来是同一组", () => {
    const periods = [
      { start: null, end: "2025-05-30" },
      { start: "2026-11-01", end: null },
    ];
    expect(parseValidity(serializeValidity(periods))).toEqual(periods);
  });
});

describe("serializeValidity", () => {
  it("两头含当天，空的那头不设限", () => {
    expect(serializeValidity([{ start: "2025-11-01", end: "2026-05-30" }])).toBe(
      "{[2025-11-01,2026-05-30]}"
    );
    expect(serializeValidity(OPEN_VALIDITY)).toBe("{(,)}");
  });
});

describe("periodsFromForm", () => {
  it("全空 = 不限", () => {
    expect(periodsFromForm(["", ""], ["", ""])).toEqual(OPEN_VALIDITY);
  });

  it("有填的时候，整对空着的跳过", () => {
    expect(periodsFromForm(["2025-11-01", ""], ["2026-05-30", ""])).toEqual([
      { start: "2025-11-01", end: "2026-05-30" },
    ]);
  });

  it("任何一段结束早于开始都拒掉", () => {
    expect(periodsFromForm(["2025-11-01", "2027-01-01"], ["2026-05-30", "2026-12-01"])).toBe(
      "dates"
    );
  });
});

describe("多段有效期", () => {
  it("落在两季中间空档里的单子盖不住", () => {
    expect(coversOrder(gapped, ["2025-12-20", "2025-12-21"])).toBe(false);
    // 有一天在空档里也不行
    expect(coversOrder(gapped, ["2025-05-30", "2025-05-31"])).toBe(false);
  });

  it("每一天都落在某一段里就盖得住", () => {
    expect(coversOrder(gapped, ["2025-01-10"])).toBe(true);
    expect(coversOrder(gapped, ["2025-01-10", "2026-12-25"])).toBe(true);
  });

  it("空档那一季不列这个资源", () => {
    expect(validityOverlaps(gapped, "2025-10-01", "2026-05-31")).toBe(false);
    expect(validityOverlaps(gapped, "2026-10-01", "2027-05-31")).toBe(true);
  });

  it("后面还有一段没结束就不算过期", () => {
    expect(isExpired(gapped)).toBe(false);
    expect(isExpired({ validity: "{[2020-11-01,2021-05-31),[2022-11-01,2023-05-31)}" })).toBe(
      true
    );
  });

  it("显示成几段连起来", () => {
    expect(formatValidity(gapped)).toBe("2024-11-01 ~ 2025-05-30、2026-11-01 ~ 2027-05-30");
  });

  it("跨度是最早开始到最晚结束", () => {
    expect(validitySpan(parseValidity(gapped.validity))).toEqual({
      start: "2024-11-01",
      end: "2027-05-30",
    });
  });
});

describe("compareByValidityStart", () => {
  it("按开始生效排，不设下限的沉底（跟原来库里 NULLS LAST 一个顺序）", () => {
    const rows = [
      { id: "open", validity: "{(,)}" },
      { id: "late", validity: "{[2026-11-01,2027-05-31)}" },
      { id: "early", validity: gapped.validity },
    ];
    expect(rows.sort(compareByValidityStart).map((r) => r.id)).toEqual(["early", "late", "open"]);
  });
});
