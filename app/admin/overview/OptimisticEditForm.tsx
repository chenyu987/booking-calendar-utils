"use client";

import { useRouter } from "next/navigation";

// 回车（或者一个字段一个表单，没有可见按钮）提交这个字段，退出分配模式。
// 打 save-field 这个 Route Handler，等它真正写完库、revalidatePath 跑完
// 再 router.push 退出——这样退出后立刻看到的就是新值（不是 Server Action
// 那种被导航直接 abort 掉的做法，也不是 sendBeacon 那种发了不等、页面
// 还显示老数据的做法）。
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
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload: Record<string, string> = {};
        fd.forEach((value, key) => {
          payload[key] = String(value);
        });
        await fetch("/admin/overview/save-field", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        router.push(exitHref);
        // staleTimes.dynamic=0 理论上够了，实测这个 Next 版本不总生效，补一个强制刷新
        router.refresh();
      }}
    >
      {children}
    </form>
  );
}
