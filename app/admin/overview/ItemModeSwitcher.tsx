"use client";

import { useRouter } from "next/navigation";
import { ITEM_MODE_COOKIE, type ItemMode } from "@/lib/itemMode";

// 筛选那一排最后「全部类型 / 只看 Alpha / 只看 Beta」那个开关（规则在 lib/itemMode.ts）。
//
// 长得跟旁边几个筛选一样，但**不在那个 FilterForm 里**：那几个走 URL，这个存 cookie、
// 每台电脑各记各的（跟「当前身份」一个做法）—— 放进表单的话改它会顺手把表单提交一次。
// 切完 router.refresh()：哪些单子、哪些资源要画出来是服务端按 cookie 筛的，换的是盘子本身
const OPTIONS: { value: ItemMode; label: string }[] = [
  { value: "", label: "全部类型" },
  { value: "alpha", label: "只看 Alpha" },
  { value: "beta", label: "只看 Beta" },
];

export default function ItemModeSwitcher({
  mode,
  style,
}: {
  mode: ItemMode;
  style?: React.CSSProperties;
}) {
  const router = useRouter();

  return (
    <select
      value={mode}
      aria-label="类型"
      title="只看 Alpha 或 Beta 的单子和资源，建单也只提示这一边的地点。地点名认不出来的单子、没填类型的资源两边都显示。每台电脑各记各的"
      onChange={(e) => {
        document.cookie = `${ITEM_MODE_COOKIE}=${e.target.value}; path=/; max-age=31536000`;
        router.refresh();
      }}
      style={style}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
