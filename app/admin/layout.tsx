import { cookies } from "next/headers";
import Link from "next/link";
import BackToHome from "@/components/BackToHome";
import ResizableNav from "./ResizableNav";
import { parseNavWidth } from "@/lib/navWidth";

const navItems = [
  { href: "/admin/overview", label: "排期总览" },
  { href: "/admin/orders", label: "Order" },
  { href: "/admin/customers", label: "Customer" },
  { href: "/admin/providers", label: "Provider" },
  { href: "/admin/resources", label: "Resource" },
  { href: "/admin/payments", label: "Payment" },
  { href: "/admin/matches", label: "Match" },
  { href: "/admin/settings", label: "设置" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 侧边栏宽度存 cookie，服务端读出来当初始值，所以跳页面不会丢、首屏不会闪。
  // Next 14.2 的 cookies() 是同步的（15 开始变 Promise，又一个不能升级的理由）。
  const initialWidth = parseNavWidth(cookies().get("admin_nav_width")?.value);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <ResizableNav initialWidth={initialWidth}>
        <BackToHome />
        <div
          style={{
            fontWeight: 500,
            marginBottom: 12,
            fontSize: 14,
            paddingTop: 8,
            borderTop: "1px solid #eee",
            whiteSpace: "nowrap",
          }}
        >
          Admin 后台
        </div>
        {navItems.map((item) => (
          <div key={item.href} style={{ marginBottom: 8, whiteSpace: "nowrap" }}>
            <Link
              href={item.href}
              style={{ color: "#333", textDecoration: "none", fontSize: 14 }}
            >
              {item.label}
            </Link>
          </div>
        ))}
      </ResizableNav>
      {/* minWidth:0 不能省：flex 子项默认 min-width:auto，不加的话排期总览那个很宽的
          日历会把整个页面撑宽，横向滚动条跑到 body 上——侧边栏和统计区跟着一起滑走。
          加上之后日历只在它自己那个 overflowX:auto 的容器里横滑，左边导航栏不动。 */}
      {/* 四边都收窄——排期总览那张日历要尽量多的面积。左边原来留 24 是想跟侧边栏
          拉开距离，但侧边栏自己已经有 16 内边距、外面还有 6px 拖拽条，再留 24 就多了；
          侧边栏拖到 0 的时候这 24 更是纯浪费。 */}
      <div style={{ flex: 1, minWidth: 0, padding: "10px 8px 8px 10px" }}>{children}</div>
    </div>
  );
}
