"use client";

// 改一个值就自动提交的表单。**没有「保存」按钮** —— 这几个是「顺手调一下」的显示设置，
// 多一步点保存纯属碍事。
//
// 跟 Order / Resource 那边的 FilterForm 是两回事，别想着合成一个：那个是 GET 表单、
// 把参数拼进 URL 自己跳转；这个提交的是 **Server Action**（要写库），
// 只能交给表单自己提交。共用的只有「change 就提交」这个意思。
//
// change 事件从里面每个控件冒泡上来：下拉选完立刻触发，数字框和日期框是
// 失焦或按回车时触发 —— 正好是「我填完了」那一刻，每敲一个字就跳转反而烦。
export default function AutoSubmitForm({
  action,
  children,
  style,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <form
      action={action}
      style={style}
      onChange={(e) => e.currentTarget.requestSubmit()}
      onSubmit={() => {
        /* 原生提交交给 action，这里不拦 */
      }}
    >
      {children}
    </form>
  );
}
