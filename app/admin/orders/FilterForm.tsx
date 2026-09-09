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
export default function FilterForm({
  action,
  children,
}: {
  action: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function submit(form: HTMLFormElement) {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      const v = String(value).trim();
      if (v) params.set(key, v);
    });
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action);
  }

  return (
    <form
      method="GET"
      action={action}
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
