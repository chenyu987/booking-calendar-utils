"use client";

// 包一层就能让里面表单的输入框/下拉框按回车直接提交，不用非得点那个按钮
export default function EnterToSubmit({ children }: { children: React.ReactNode }) {
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).closest("form")?.requestSubmit();
        }
      }}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
