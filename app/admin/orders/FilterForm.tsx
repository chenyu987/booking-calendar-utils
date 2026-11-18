"use client";

import { useRouter } from "next/navigation";

// Order 列表的筛选表单。
//
// 没有「筛选」按钮：改一个条件就自动筛。form 上挂一个 onChange 就够了——
// change 事件会从里面每个控件冒泡上来，下拉框选完立刻触发，文本框则是
// 失焦或按回车时触发（正好是"我填完了"的时刻，每敲一个字就跳转反而烦）。
//
// 提交时**把空值剔掉**再拼 URL。原生 GET 表单会把所有控件都带上，
// 地址栏会变成 ?customer=&location=&party=&from=... 一长串空参数，
// 既难看又没法一眼看出到底筛了什么。
// 「当场筛、不回服务端」的页面在这儿登记（排期总览，OverviewBoard）：
// 选完先问它，它说行（比如季没换，数据手上都有）就只改地址栏（replaceState），浏览器从地址栏读出来当场重算；
// 它说不行（换季了，要另一批数据）照旧跳转。**登记了的页面，提交时在当前地址栏的基础上改**（表单里有的参数才动），
// 不用再在每个表单里藏一堆 hidden 把别的筛选原样带过去
const instant = new Map<string, (next: URLSearchParams) => boolean>();

export function registerInstantFilter(action: string, fn: ((next: URLSearchParams) => boolean) | null) {
  if (fn) instant.set(action, fn);
  else instant.delete(action);
}

export default function FilterForm({
  action,
  children,
  style,
}: {
  action: string;
  children: React.ReactNode;
  /** 排期总览把它塞在统计行里，要能自己排版 */
  style?: React.CSSProperties;
}) {
  const router = useRouter();

  function submit(form: HTMLFormElement) {
    const handler = instant.get(action);
    const params = new URLSearchParams(handler ? window.location.search : "");
    if (handler) {
      // 表单里有的参数先清掉，下面按表单里填的重新放；表单里没有的（别的筛选）原样留着
      for (const el of Array.from(form.elements) as HTMLInputElement[]) if (el.name) params.delete(el.name);
    }
    new FormData(form).forEach((value, key) => {
      const v = String(value).trim();
      // 同名的好几个（多选的勾选框）用逗号接起来：item=alpha,beta-full
      if (v) params.set(key, params.has(key) ? `${params.get(key)},${v}` : v);
    });
    const qs = params.toString();
    const url = qs ? `${action}?${qs}` : action;
    if (handler?.(params)) {
      window.history.replaceState(null, "", url);
      return;
    }
    router.push(url);
  }

  return (
    <form
      method="GET"
      action={action}
      style={style}
      onChange={(e) => submit(e.currentTarget)}
      // 没有提交按钮时回车不会触发原生提交，但文本框的 change 已经覆盖了回车，
      // 这里兜一下防止将来有人加了按钮又忘了处理
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
