import Link from "next/link";
import { PUBLIC_LINKS } from "@/lib/publicLinks";

const adminLinks = [
  { href: "/admin/overview", label: "排期总览", desc: "日历式看全部订单和资源" },
  { href: "/admin/orders", label: "Order 订单", desc: "建单、改单、分配" },
  { href: "/admin/resources", label: "Resource 资源", desc: "管理可租的资源" },
  { href: "/admin/matches", label: "Match 匹配", desc: "处理匹配意向" },
  { href: "/admin/payments", label: "Payment 记账", desc: "收款记录" },
  { href: "/admin/customers", label: "Customer 客户", desc: "客户信息" },
  { href: "/admin/providers", label: "Provider 物主", desc: "物主信息" },
];


export default function HomePage() {
  return (
    <main style={{ padding: 32, maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Beta / Alpha 租借平台</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: 0 }}>
        物品匹配与订单管理
      </p>

      <Section title="Admin 后台" links={adminLinks} />
      <Section title="对外页面" links={[...PUBLIC_LINKS]} />
    </main>
  );
}

function Section({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; desc: string }[];
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 14, color: "#888", fontWeight: 500, marginBottom: 10 }}>
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: "block",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "12px 14px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500 }}>{l.label}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{l.desc}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
