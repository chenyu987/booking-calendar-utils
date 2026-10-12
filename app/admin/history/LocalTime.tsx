"use client";

// 记录时间按**看的人那台电脑**的时区显示。服务器在 UTC，管理员不一定在同一个时区，
// 服务端排好的字符串对谁都可能差几个小时。服务端先出一份 UTC 的，到浏览器里换成本地的 ——
// 两边不一样是预期内的，所以压掉 hydration 的提示
export default function LocalTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return <span suppressHydrationWarning>{text}</span>;
}
