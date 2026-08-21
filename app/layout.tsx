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
    <html lang="zh" style={{ colorScheme: "light" }}>
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
