import { LOCATION_OPTIONS } from "@/lib/locations";

export const LOCATION_LIST_ID = "location-options";

/**
 * 填地点名的输入框共用的补全列表。用原生 <datalist>：不用客户端状态，
 * 打字过滤、点一下选中都是浏览器自带的行为。
 *
 * value 是库里的写法（locbe / ns / locaf…），选了就一定认得出来；
 * 旁边显示全称和区域，免得只看缩写不知道是哪个地点。
 *
 * 配合订单上那个「认不出来标红」用：补全负责事前少写错，标红负责事后揪出来。
 * 两个都不强制 —— 地点名还是能自由填，毕竟总有库里没有的地方。
 */
export default function LocationDatalist() {
  return (
    <datalist id={LOCATION_LIST_ID}>
      {LOCATION_OPTIONS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.hint}
        </option>
      ))}
    </datalist>
  );
}
