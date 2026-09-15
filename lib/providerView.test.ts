import { describe, it, expect } from "vitest";
import { parseView } from "./providerView";

describe("parseView", () => {
  it("默认日历", () => {
    expect(parseView(undefined)).toBe("calendar");
    expect(parseView("")).toBe("calendar");
    expect(parseView("乱填")).toBe("calendar");
  });

  it("明写 list 才切过去", () => {
    expect(parseView("list")).toBe("list");
  });
});
