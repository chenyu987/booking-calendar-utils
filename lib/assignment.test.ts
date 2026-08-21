import { describe, it, expect } from "vitest";
import { computeNeed, formatNeed, formatGap } from "./assignment";

describe("computeNeed", () => {
  it("1男1女订单，两个资源都配了就算配齐", () => {
    const order = { male_count: 1, female_count: 1 };
    const need = computeNeed(order, [
      { holder_gender: "male" },
      { holder_gender: "female" },
    ]);
    expect(need.isComplete).toBe(true);
    expect(need.maleGap).toBe(0);
    expect(need.femaleGap).toBe(0);
  });

  it("配一半不算配齐", () => {
    const order = { male_count: 1, female_count: 1 };
    const need = computeNeed(order, [{ holder_gender: "male" }]);
    expect(need.isComplete).toBe(false);
    expect(need.femaleGap).toBe(1);
  });

  it("没配任何资源是 isEmpty", () => {
    const order = { male_count: 1, female_count: 0 };
    const need = computeNeed(order, []);
    expect(need.isEmpty).toBe(true);
    expect(need.isComplete).toBe(false);
  });

  it("male_count/female_count 缺省当 0", () => {
    const need = computeNeed({}, []);
    expect(need.maleNeeded).toBe(0);
    expect(need.femaleNeeded).toBe(0);
    expect(need.isComplete).toBe(true); // 什么都不需要，自然配齐
  });
});

describe("formatNeed", () => {
  it("男女都要显示两段", () => {
    const need = computeNeed({ male_count: 1, female_count: 1 }, [
      { holder_gender: "male" },
    ]);
    expect(formatNeed(need)).toBe("男1/1 女0/1");
  });

  it("只要男的只显示男", () => {
    const need = computeNeed({ male_count: 2, female_count: 0 }, []);
    expect(formatNeed(need)).toBe("男0/2");
  });
});

describe("formatGap", () => {
  it("配齐了显示已配齐", () => {
    const need = computeNeed({ male_count: 1, female_count: 0 }, [
      { holder_gender: "male" },
    ]);
    expect(formatGap(need)).toBe("已配齐");
  });

  it("还差男女各一张", () => {
    const need = computeNeed({ male_count: 1, female_count: 1 }, []);
    expect(formatGap(need)).toBe("还差 1张男资源、1张女资源");
  });
});
