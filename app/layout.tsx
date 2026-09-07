export const metadata = {
  title: "Beta/Alpha 租借管理后台",
  description: "订单管理 MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh"
      // overscrollBehaviorX：横向滑到头之后别把手势交给浏览器。
      // 排期总览要大量左右滑，一不留神用过头就触发 Chrome 的「返回上一页」，
      // 整个页面就跳走了。Google Sheet 也是靠这个属性挡掉的。
      // 写在 <html> 上：按规范只有根元素的 overscroll-behavior 会传播到视口，
      // 写在 body 上不传播。
      style={{ colorScheme: "light", overscrollBehaviorX: "none" }}
    >
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#fff",
          color: "#222",
        }}
      >
        {children}
      </body>
    </html>
  );
}
