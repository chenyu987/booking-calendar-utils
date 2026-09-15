import Link from "next/link";
import { PUBLIC_LINKS } from "@/lib/publicLinks";

// 「对外页面」那几个资源片。**只有一份** —— 排期总览右边那道帘子和其它 admin 页
// 右边那道帘子画的是同一批东西，各写一份的话加一个对外页面就得改两处，
// 迟早出现「总览里有、别的页没有」。链接本身也早就收在 lib/publicLinks.ts 了。
//
// 没有 "use client"：一个只渲染不带状态的组件，服务端和客户端组件里都能用。
export default function PublicLinkCards() {
  return (
    <>
      {PUBLIC_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          style={{
            display: "block",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>{l.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{l.desc}</div>
        </Link>
      ))}
    </>
  );
}
