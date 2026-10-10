import { describe, expect, it } from "vitest";
import {
  inSeason,
  nextSeason,
  parseSeasonKey,
  seasonDays,
  seasonFor,
  seasonOf,
  seasonsBetween,
} from "./season";

describe("一天落在哪一季", () => {
  it.each([
    ["2025-10-01", "25-26-na"], // A 区从 10/1 起算：十月提前下的单有地方放
    ["2025-12-24", "25-26-na"],
    ["2026-01-01", "25-26-na"],
    ["2026-05-31", "25-26-na"],
    ["2026-06-01", "25-26-au"], // B 区那季跟着前一个A 区季叫
    ["2026-09-30", "25-26-au"],
    ["2026-10-08", "26-27-na"],
    ["2025-07-15", "24-25-au"],
  ])("%s → %s", (day, key) => {
    expect(seasonOf(day).key).toBe(key);
  });

  it("首尾相接不留缝：一季的最后一天 +1 正好是下一季的第一天", () => {
    let s = seasonFor("na", 2024);
    for (let i = 0; i < 6; i++) {
      const next = nextSeason(s);
      const after = new Date(`${s.end}T00:00:00Z`);
      after.setUTCDate(after.getUTCDate() + 1);
      expect(after.toISOString().slice(0, 10)).toBe(next.start);
      expect(seasonOf(s.end).key).toBe(s.key);
      expect(seasonOf(next.start).key).toBe(next.key);
      s = next;
    }
  });

  it("名字和起止", () => {
    expect(seasonFor("na", 2025)).toMatchObject({ label: "25-26 A 区", start: "2025-10-01", end: "2026-05-31" });
    expect(seasonFor("au", 2024)).toMatchObject({ label: "24-25 B 区", start: "2025-06-01", end: "2025-09-30" });
  });
});

describe("URL 上的 season 参数", () => {
  it("认得出来的", () => {
    expect(parseSeasonKey("25-26-na")?.start).toBe("2025-10-01");
    expect(parseSeasonKey("24-25-au")?.start).toBe("2025-06-01");
    expect(parseSeasonKey("99-00-na")?.start).toBe("2099-10-01");
  });

  it.each([undefined, null, "", "25-27-na", "2025-na", "25-26-eu", "25-26-NA", "x25-26-na"])(
    "认不出来的当没写：%s",
    (raw) => {
      expect(parseSeasonKey(raw as any)).toBeNull();
    }
  );
});

describe("下拉里列哪几季", () => {
  it("从最早到最晚每一季都列，新的在前，A 区B 区交替", () => {
    const list = seasonsBetween(seasonOf("2024-12-01"), seasonOf("2026-10-08"));
    expect(list.map((s) => s.key)).toEqual(["26-27-na", "25-26-au", "25-26-na", "24-25-au", "24-25-na"]);
  });

  it("同一季只有一项；顺序反了也不会转出一长串", () => {
    expect(seasonsBetween(seasonOf("2026-01-01"), seasonOf("2026-02-01")).map((s) => s.key)).toEqual(["25-26-na"]);
    expect(seasonsBetween(seasonOf("2026-10-08"), seasonOf("2024-12-01")).map((s) => s.key)).toEqual(["24-25-na"]);
  });
});

describe("季里的日子", () => {
  it("A 区季 243 天（含闰年那季 2 月 29 日），B 区季 122 天", () => {
    expect(seasonDays(seasonFor("na", 2025))).toHaveLength(243);
    expect(seasonDays(seasonFor("na", 2027))).toHaveLength(244);
    expect(seasonDays(seasonFor("au", 2025))).toHaveLength(122);
  });

  it("inSeason 两头都算", () => {
    const s = seasonFor("na", 2025);
    expect(inSeason("2025-10-01", s)).toBe(true);
    expect(inSeason("2026-05-31", s)).toBe(true);
    expect(inSeason("2025-09-30", s)).toBe(false);
    expect(inSeason("2026-06-01", s)).toBe(false);
  });
});
