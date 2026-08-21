"use client";

import { useRouter } from "next/navigation";

// 回车（或者一个字段一个表单，没有可见按钮）提交这个字段，退出分配模式。
// 用 sendBeacon 把这个表单的字段打到 save-field 这个 Route Handler，
// 不等响应就直接跳转——sendBeacon 浏览器保证请求会送达，不会被
// 紧跟着的这次导航打断（Server Action 会，实测过，见 save-field/route.ts）。
export default function OptimisticEditForm({
  exitHref,
  style,
  children,
}: {
  exitHref: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <form
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload: Record<string, string> = {};
        fd.forEach((value, key) => {
          payload[key] = String(value);
        });
        navigator.sendBeacon(
          "/admin/overview/save-field",
          new Blob([JSON.stringify(payload)], { type: "application/json" })
        );
        router.push(exitHref);
      }}
    >
      {children}
    </form>
  );
}
