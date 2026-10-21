import { describe, it, expect } from "vitest";
import { addressFromFormData, formatAddress } from "./address";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("addressFromFormData", () => {
  it("空的存 null、两头空格去掉、国家转大写", () => {
    expect(addressFromFormData(fd({ city: "  Vancouver ", address_line2: " ", country: "ca" }))).toEqual({
      address: {
        address_line1: null,
        address_line2: null,
        city: "Vancouver",
        region: null,
        postal_code: null,
        country: "CA",
      },
    });
  });

  it("国家不是两位字母就拒，不猜", () => {
    expect(addressFromFormData(fd({ country: "USA" }))).toEqual({ error: "country" });
    expect(addressFromFormData(fd({ country: "美国" }))).toEqual({ error: "country" });
  });

  it("邮编原样留着（前导 0、中间空格）", () => {
    const r = addressFromFormData(fd({ postal_code: "02134" }));
    expect("address" in r && r.address.postal_code).toBe("02134");
  });
});

describe("formatAddress", () => {
  it("州和邮编连在一起，国家显示中文，空的跳过", () => {
    expect(
      formatAddress({ address_line1: "123 Main St", city: "Vancouver", region: "BC", postal_code: "V6B 1A1", country: "CA" })
    ).toBe("123 Main St, Vancouver, BC V6B 1A1, 加拿大");
  });
  it("一个都没填是 null", () => {
    expect(formatAddress({ city: null })).toBeNull();
  });
});
