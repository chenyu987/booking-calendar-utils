import type { CSSProperties } from "react";
import { COUNTRY_OPTIONS, type Address } from "@/lib/address";

// 地址那几个输入框（0028）。后台 Provider 管理和物主自己的账号菜单共用 ——
// name 必须跟 lib/address.ts 的 ADDRESS_FIELDS 对上，addressFromFormData 按它读。
// 没有状态，不是客户端组件；样式由调用方传，两边的输入框长得不一样
export default function AddressFields({
  value,
  inputStyle,
  layout,
  labelStyle,
}: {
  value: Address | null | undefined;
  inputStyle: CSSProperties;
  /** stack = 一项一行带标签（物主菜单那种窄面板）；row = 一行排开、只用占位文字（后台表格） */
  layout: "stack" | "row";
  labelStyle?: CSSProperties;
}) {
  const v = (k: keyof Address) => value?.[k] ?? "";
  const country = v("country");
  // 库里有、下拉里没有的国家也要列出来，不然一保存就被悄悄清空
  const extra = country && !COUNTRY_OPTIONS.some((c) => c.code === country) ? [country] : [];

  const fields = [
    { name: "address_line1", label: "地址", placeholder: "街道门牌", flex: 2 },
    { name: "address_line2", label: "地址第二行", placeholder: "Apt / Unit", flex: 1 },
    { name: "city", label: "城市", placeholder: "城市", flex: 1 },
    { name: "region", label: "州 / 省", placeholder: "州 / 省", flex: 0.6 },
    { name: "postal_code", label: "邮编", placeholder: "邮编", flex: 0.8 },
  ] as const;

  const countrySelect = (
    <select
      name="country"
      defaultValue={country}
      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
    >
      <option value="">{layout === "row" ? "国家" : "—"}</option>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
      {extra.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  if (layout === "row") {
    return (
      <>
        {fields.map((f) => (
          <input
            key={f.name}
            name={f.name}
            defaultValue={v(f.name)}
            placeholder={f.placeholder}
            title={f.label}
            // width 0 + flex：按比例分整行，不按输入框自带的宽度撑
            style={{ ...inputStyle, flex: f.flex, width: 0, minWidth: 0, boxSizing: "border-box" }}
          />
        ))}
        <div style={{ flex: 0.8, minWidth: 0 }}>{countrySelect}</div>
      </>
    );
  }

  return (
    <>
      {fields.map((f) => (
        <label key={f.name} style={labelStyle}>
          {f.label}
          <input name={f.name} defaultValue={v(f.name)} style={inputStyle} />
        </label>
      ))}
      <label style={labelStyle}>
        国家
        {countrySelect}
      </label>
    </>
  );
}
