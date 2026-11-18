"use client";

import { useSearchParams } from "next/navigation";
import FilterForm from "@/app/admin/orders/FilterForm";
import ItemModeSwitcher from "./ItemModeSwitcher";
import { CONTACT_FILTER_NONE, type Admin } from "@/lib/admins";
import { LOCATION_OPTIONS, REGION_LABELS, type Region } from "@/lib/locations";
import { STATUS_LABELS } from "@/lib/orderStatus";
import { overviewHref, parseOverviewQuery } from "@/lib/overviewQuery";
import type { ItemMode } from "@/lib/itemMode";

// 排期总览顶上那一排订单筛选（季 / 区域 / 地点 / 状态 / 管理员）+ 类型开关。
//
// **在浏览器里**（2026-11-18）：切区域、地点、状态、管理员只改地址栏，日历当场重算（FilterForm 的
// registerInstantFilter，OverviewBoard 登记的）；只有换季要回服务端拿另一季的数据。
// 所以这一排要跟着地址栏变（地点的选项跟着区域收窄、「清除」出不出现），不能是服务端画死的。
// 用 GET 表单不用 useState：JS 没跑起来时照样能筛，刷新、分享链接都还在。
export default function OverviewFilters({
  seasonOptions,
  currentSeasonKey,
  seasonParam,
  admins,
  primaryAdminId,
  itemMode,
  selectStyle,
}: {
  seasonOptions: { key: string; label: string }[];
  currentSeasonKey: string;
  /** 正在看的季（今天这季是空的：默认那档不写进 URL） */
  seasonParam: string;
  admins: Admin[];
  primaryAdminId: string | null;
  itemMode: ItemMode;
  selectStyle: React.CSSProperties;
}) {
  const sp = useSearchParams();
  const { orderFilter, hasOrderFilter } = parseOverviewQuery(sp, admins);

  return (
    // 外面再包一层同样 gap 的 flex：类型开关在表单外面（见下），不包的话它跟前面那排下拉
    // 之间隔的是外层的大间距，看着像另一组。ov-filters：手机上这一排换行（lib/adminMobile.ts）
    <div className="ov-filters" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <FilterForm action="/admin/overview" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* 看哪一季。放最前面：它决定读哪批数据，后面几个筛选都是在这一季里面再筛。
            今天这季的选项值是空的 —— 默认那档不写进 URL（FilterForm 会剔掉空值） */}
        <select key={`season-${seasonParam}`} name="season" defaultValue={seasonParam} style={selectStyle} aria-label="季">
          {seasonOptions.map((s) => (
            <option key={s.key} value={s.key === currentSeasonKey ? "" : s.key}>
              {s.label}
              {s.key === currentSeasonKey ? "（本季）" : ""}
            </option>
          ))}
        </select>
        {/* key 不能省：defaultValue 只在挂载时读一次，地址栏上的参数变了（建完新单把筛选清掉了、
            点了「清除」）而 DOM 节点被复用，下拉框会一直显示旧值。把值拼进 key，值一变就重新挂载 */}
        <select key={`region-${orderFilter.region}`} name="region" defaultValue={orderFilter.region} style={selectStyle}>
          <option value="">全部区域</option>
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <option key={r} value={r}>
              {REGION_LABELS[r]}
            </option>
          ))}
        </select>
        {/* 三个筛选共用固定宽度，一条线上对齐；选项只留 label（canonical 九成情况下是同一个词） */}
        <select key={`mtn-${orderFilter.mtn}`} name="mtn" defaultValue={orderFilter.mtn} style={selectStyle}>
          <option value="">全部地点</option>
          {LOCATION_OPTIONS.filter(
            (m) => (!orderFilter.region || m.region === orderFilter.region) && (!itemMode || m.item === itemMode)
          ).map((m) => (
            <option key={m.value} value={m.value} title={m.hint}>
              {m.label}
            </option>
          ))}
        </select>
        {/* 按订单状态筛。选项顺序直接吃 STATUS_LABELS，跟图例、色块里的下拉框同一个源 */}
        <select key={`ostatus-${orderFilter.status}`} name="ostatus" defaultValue={orderFilter.status} style={selectStyle}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {/* 这一单是哪个管理员的。名单跟标题旁边「当前身份」是同一份（admins 表） */}
        <select key={`oadmin-${orderFilter.admin}`} name="oadmin" defaultValue={orderFilter.admin} style={selectStyle}>
          <option value="">全部管理员</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {/* 设了主要管理员之后，没写是谁的单都算他的，就不存在「没标」了 */}
          {!primaryAdminId && <option value={CONTACT_FILTER_NONE}>没标</option>}
        </select>
        {hasOrderFilter && (
          <a
            href={overviewHref(sp, { region: "", mtn: "", ostatus: "", oadmin: "" })}
            // 不回服务端：只改地址栏，日历当场重算（JS 没跑起来时 href 照样能用）
            onClick={(e) => {
              e.preventDefault();
              window.history.replaceState(null, "", overviewHref(sp, { region: "", mtn: "", ostatus: "", oadmin: "" }));
            }}
            style={{ fontSize: 12, color: "var(--text-faint)" }}
          >
            清除
          </a>
        )}
      </FilterForm>
      {/* 「全部 / Alpha / Beta」开关。存 cookie 不走 URL，所以放在表单外面（见 ItemModeSwitcher） */}
      <ItemModeSwitcher mode={itemMode} style={selectStyle} />
    </div>
  );
}
