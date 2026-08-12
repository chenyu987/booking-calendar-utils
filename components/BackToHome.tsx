import Link from "next/link";

// 每个页面左上角的「返回主页」，主页 = 订单列表 + 全部导航入口
export default function BackToHome() {
  return (
    <Link
      href="/"
      style={{
        display: "inline-block",
        marginBottom: 12,
        fontSize: 13,
        color: "#666",
        textDecoration: "none",
      }}
    >
      ← 返回主页
    </Link>
  );
}
