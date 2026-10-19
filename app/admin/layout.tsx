import { cookies } from "next/headers";
import Link from "next/link";
import BackToHome from "@/components/BackToHome";
import ResizableNav from "./ResizableNav";
import EnvBanner from "./EnvBanner";
import PublicRail from "./PublicRail";
import { clampRailWidth } from "@/lib/bandDays";
import { parseNavWidth } from "@/lib/navWidth";
import SettingsTrigger from "@/components/SettingsTrigger";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

const navItems = [
  { href: "/admin/overview", label: "排期总览" },
  { href: "/admin/orders", label: "Order" },
  { href: "/admin/customers", label: "Customer" },
  { href: "/admin/providers", label: "Provider" },
  { href: "/admin/resources", label: "Resource" },
  { href: "/admin/payments", label: "Payment" },
  { href: "/admin/matches", label: "Match" },
  { href: "/admin/referrals", label: "Referral" },
  { href: "/admin/history", label: "改动记录" },
];

export default async function AdminLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  // 侧边栏宽度存 cookie，服务端读出来当初始值，所以跳页面不会丢、首屏不会闪。
  const jar = await cookies();
  const initialWidth = parseNavWidth(jar.get("admin_nav_width")?.value);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  // 「对外页面」那道帘子的宽度。跟排期总览共用同一个 cookie —— 对人来说那就是
  // 同一道帘子，在总览拖宽了、切到 Order 页还该是那么宽
  const railWidth = clampRailWidth(Number(jar.get("overview_rail_width")?.value));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <ResizableNav initialWidth={initialWidth}>
        <EnvBanner />
        <BackToHome />
        <div
          style={{
            fontWeight: 500,
            marginBottom: 12,
            fontSize: 14,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            whiteSpace: "nowrap",
          }}
        >
          Admin 后台
        </div>
        {navItems.map((item) => (
          <div key={item.href} style={{ marginBottom: 8, whiteSpace: "nowrap" }}>
            <Link
              href={item.href}
              style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}
            >
              {item.label}
            </Link>
          </div>
        ))}
        {/* 设置是弹框不是页面：顺手调一下不该把手上的位置（滚到哪一周、
            正在配哪一单）弄丢 */}
        <div style={{ marginBottom: 8, whiteSpace: "nowrap" }}>
          <SettingsTrigger theme={theme} />
        </div>
        {/* 换管理员 = 退出、换账号登。身份从登录账号来（lib/adminAuth.ts） */}
        <form action="/auth/signout?as=admin" method="post" style={{ marginBottom: 8, whiteSpace: "nowrap" }}>
          <button
            type="submit"
            style={{
              padding: 0,
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            退出登录
          </button>
        </form>
      </ResizableNav>
      {/* minWidth:0 不能省：flex 子项默认 min-width:auto，不加的话排期总览那个很宽的
          日历会把整个页面撑宽，横向滚动条跑到 body 上——侧边栏和统计区跟着一起滑走。
          加上之后日历只在它自己那个 overflowX:auto 的容器里横滑，左边导航栏不动。 */}
      {/* 四边都收窄——排期总览那张日历要尽量多的面积。左边原来留 24 是想跟侧边栏
          拉开距离，但侧边栏自己已经有 16 内边距、外面还有 6px 拖拽条，再留 24 就多了；
          侧边栏拖到 0 的时候这 24 更是纯浪费。 */}
      <div style={{ flex: 1, minWidth: 0, padding: "10px 8px 8px 10px" }}>{children}</div>
      {/* 「对外页面」帘子：**每个 admin 页都有**，切 tab 不会丢。
          排期总览自己那道兼着「改每行几天」，所以 PublicRail 在总览页让开 */}
      <PublicRail initialWidth={railWidth} />
    </div>
  );
}
