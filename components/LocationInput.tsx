"use client";

import { useId, useState } from "react";
import { LOCATION_OPTIONS, type ItemType } from "@/lib/locations";

/**
 * 填地点名的输入框，**打字之后才给建议**。
 *
 * 原生 <datalist> 一点进去就把全部选项糊出来 —— 33 个场地铺满半屏，
 * 比没有还烦，而且挡住了下面正在填的东西。没法只靠 CSS 关掉，
 * 所以改成按输入动态生成：没打字就一个选项都不给（连 list 属性都不挂，
 * 浏览器自然什么都不弹）。
 *
 * **从头匹配，不是包含**：打「pe」只出 locbl，不出 locao ——
 * 中间碰巧含这两个字母的不该冒出来，一冒出来就得费眼睛去分辨。
 *
 * 除了库里的写法，全称和区域也能从头打：打「whis」出 locaj，
 * 打「regionB」出 locag / ns / locai。按**词**判断开头，
 * 所以「Mount Locao」打「suna」出得来，打「ount」出不来。
 * 最多给 8 条，多了还是糊屏。
 *
 * 受控（value + onChange）和非受控（defaultValue）两种都支持 ——
 * 建单弹窗是受控的，其它几处是表单里的非受控输入。
 *
 * `item` 给了就只提示那一边的地点（排期总览的「Alpha / Beta」开关）。只管提示，
 * 打了另一边的地点名照样能打进去 —— 拦不拦是调用方的事。
 */
export default function LocationInput({
  value,
  defaultValue,
  onChange,
  className,
  item,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { item?: ItemType | "" }) {
  const listId = `location-${useId()}`;
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : inner;

  const typed = current.trim().toLowerCase();
  const options = typed ? pickOptions(typed, item || null) : [];

  return (
    <>
      <input
        {...rest}
        className={["location-input", className].filter(Boolean).join(" ")}
        value={value}
        defaultValue={defaultValue}
        // 没有可给的建议就不挂 list：挂了浏览器就会弹（哪怕是空的）
        list={options.length > 0 ? listId : undefined}
        onChange={(e) => {
          if (value === undefined) setInner(e.target.value);
          onChange?.(e);
        }}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((m) => (
            <option key={m.value} value={m.value}>
              {m.hint}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
}

/** 把「Hidden Valley（Missouri） · 中西部」切成词，用来判断是不是从某个词的开头打的 */
function words(hint: string): string[] {
  return hint
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter(Boolean);
}

function pickOptions(typed: string, item: ItemType | null) {
  const pool = item ? LOCATION_OPTIONS.filter((m) => m.item === item) : LOCATION_OPTIONS;
  // 库里的写法从头对上的排最前 —— 那是我们自己天天打的那个词
  const byValue = pool.filter((m) => m.value.startsWith(typed));
  const seen = new Set(byValue.map((m) => m.value));
  // 其次是全称/区域里某个词从头对上的
  const byHint = pool.filter(
    (m) => !seen.has(m.value) && words(m.hint).some((w) => w.startsWith(typed))
  );
  return [...byValue, ...byHint].slice(0, 8);
}
