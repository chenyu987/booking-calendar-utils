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
        {/* 藏掉 Chrome 给 <input list> 画的那个 ▾ 按钮：色块里那个地点名框只有
            几十像素宽，一个 ▾ 就占掉一大截还挡字。藏了之后补全照样有。
            放这儿是因为项目没有全局样式表（全是内联样式），而这条规则四个页面都要。
            用 dangerouslySetInnerHTML：JSX 会把属性选择器里的引号转义成 &quot;，
            那条 CSS 就成了死的 —— 这个坑踩过一次（#21）。 */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              "input.location-input::-webkit-calendar-picker-indicator{display:none!important}" +
              // 日期条上的空备注：平时完全看不见，鼠标移上去才浮出一条虚线。
              // 这条必须是 CSS 的 :hover，不能用 React state —— 点进去编辑时这个
              // div 被输入框换掉了，鼠标移走时它已经不在，onMouseLeave 永远不会
              // 触发，hover 就永久卡在 true，虚线赖着不走
              ".day-note-empty:hover{border-bottom-color:#bbb}" +
              ".day-note-empty.day-note-peak:hover{border-bottom-color:#a48ee0}",
          }}
        />
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
