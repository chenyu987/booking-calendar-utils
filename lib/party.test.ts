import { describe, it, expect } from "vitest";
import { formatParty } from "./party";

describe("formatParty", () => {
  it("1男1女", () => {
    expect(formatParty(1, 1)).toBe("1男1女");
  });

  it("只有男的", () => {
    expect(formatParty(2, 0)).toBe("2男");
  });

  it("只有女的", () => {
    expect(formatParty(0, 3)).toBe("3女");
  });

  it("都是 0/缺省显示占位符", () => {
    expect(formatParty(0, 0)).toBe("-");
    expect(formatParty(null, undefined)).toBe("-");
  });
});
