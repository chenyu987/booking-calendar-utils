"use client";

// 放在服务端表单里的提交按钮，点了先弹一句确认，取消就不提交。
// 删群这种点错了要重新加、还得重新对名字的操作用它。
export default function ConfirmSubmit({
  message,
  children,
  style,
}: {
  message: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="submit"
      style={style}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
