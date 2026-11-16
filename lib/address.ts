// 人的地址（people 上的六列，迁移 0028）。表单读取、校验、显示的唯一出处 ——
// 后台 Provider 管理和物主自己的账号菜单共用，别在页面里各写一份。

export const ADDRESS_FIELDS = [
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "country",
] as const;

export type AddressField = (typeof ADDRESS_FIELDS)[number];
export type Address = Partial<Record<AddressField, string | null>>;

/** 查人时点名带上这几列：select(`…, ${ADDRESS_COLUMNS}`) */
export const ADDRESS_COLUMNS =
  "address_line1, address_line2, city, region, postal_code, country" as const;

/** 下拉里给的国家。库里只认 ISO 两位大写（check 约束），所以表单上不让自由填 */
export const COUNTRY_OPTIONS = [
  { code: "US", label: "美国" },
  { code: "CA", label: "加拿大" },
  { code: "AU", label: "B 区" },
] as const;

export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}

/**
 * 从表单读地址。空的一律存 null（不存空字符串，不然「填没填」要判断两种空）。
 * 国家不是两位字母就返回 error，不猜 —— 库里的 check 也会拦，这里先拦是为了给人看得懂的原因。
 */
export function addressFromFormData(
  formData: FormData
): { address: Record<AddressField, string | null> } | { error: "country" } {
  const get = (k: AddressField) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const country = get("country")?.toUpperCase() ?? null;
  if (country && !/^[A-Z]{2}$/.test(country)) return { error: "country" };
  return {
    address: {
      address_line1: get("address_line1"),
      address_line2: get("address_line2"),
      city: get("city"),
      region: get("region"),
      postal_code: get("postal_code"),
      country,
    },
  };
}

/**
 * 列表里的短地址：「Vancouver, BC V6B 1A1」—— 城市、州 / 省、邮编，看物主在哪一带。
 * 街道和国家不带（完整的放 title 里）。城市州邮编都没填才退回国家。一个都没填返回 null
 */
export function formatAddressShort(a: Address | null | undefined): string | null {
  if (!a) return null;
  const regionPostal = [a.region, a.postal_code].filter(Boolean).join(" ");
  const s = [a.city, regionPostal].filter(Boolean).join(", ");
  return s || countryLabel(a.country);
}

/** 一行显示：「123 Main St, Apt 4, Vancouver, BC V6B 1A1, 加拿大」。一个都没填返回 null */
export function formatAddress(a: Address | null | undefined): string | null {
  if (!a) return null;
  const regionPostal = [a.region, a.postal_code].filter(Boolean).join(" ");
  const parts = [a.address_line1, a.address_line2, a.city, regionPostal, countryLabel(a.country)].filter(
    Boolean
  );
  return parts.length ? parts.join(", ") : null;
}
