import Link from "next/link";
import BackToHome from "@/components/BackToHome";

const navItems = [
  { href: "/admin/overview", label: "排期总览" },
  { href: "/admin/orders", label: "Order" },
  { href: "/admin/customers", label: "Customer" },
  { href: "/admin/providers", label: "Provider" },
  { href: "/admin/resources", label: "Resource" },
  { href: "/admin/payments", label: "Payment" },
  { href: "/admin/matches", label: "Match" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 160,
          flexShrink: 0,
          borderRight: "1px solid #eee",
          padding: 16,
        }}
      >
        <BackToHome />
        <div
          style={{
            fontWeight: 500,
            marginBottom: 12,
            fontSize: 14,
            paddingTop: 8,
            borderTop: "1px solid #eee",
          }}
        >
          Admin 后台
        </div>
        {navItems.map((item) => (
          <div key={item.href} style={{ marginBottom: 8 }}>
            <Link
              href={item.href}
              style={{ color: "#333", textDecoration: "none", fontSize: 14 }}
            >
              {item.label}
            </Link>
          </div>
        ))}
      </nav>
      <div style={{ flex: 1, padding: 24 }}>{children}</div>
    </div>
  );
}
