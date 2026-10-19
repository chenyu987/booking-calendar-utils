import { cookies } from "next/headers";
import { themeCss, parseTheme, THEME_COOKIE } from "@/lib/theme";

export const metadata = {
  title: "Beta/Alpha 租借管理后台",
  description: "订单管理 MVP",
};

export default async function RootLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  // 服务端就把选好的主题写进 <html>：放到客户端再挂的话，首屏会先按亮色画一遍
  // 再刷成暗色，闪一下。没选过就不写这个属性，交给 prefers-color-scheme
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="zh"
      data-theme={theme ?? undefined}
      // overscrollBehaviorX：横向滑到头之后别把手势交给浏览器。
      // 排期总览要大量左右滑，一不留神用过头就触发 Chrome 的「返回上一页」，
      // 整个页面就跳走了。Google Sheet 也是靠这个属性挡掉的。
      // 写在 <html> 上：按规范只有根元素的 overscroll-behavior 会传播到视口，
      // 写在 body 上不传播。
      // color-scheme 交给 CSS 里的 :root 管（跟着主题走），这儿只留滑动那条
      style={{ overscrollBehaviorX: "none" }}
    >
      <head>
        {/* 藏掉 Chrome 给 <input list> 画的那个 ▾ 按钮：色块里那个地点名框只有
            几十像素宽，一个 ▾ 就占掉一大截还挡字。藏了之后补全照样有。
            放这儿是因为项目没有全局样式表（全是内联样式），而这条规则四个页面都要。
            用 dangerouslySetInnerHTML：JSX 会把属性选择器里的引号转义成 &quot;，
            那条 CSS 就成了死的 —— 这个坑踩过一次（#21）。 */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              // 两套配色的变量。必须排在最前面：后面那些规则要用这里的 var()
              themeCss() +
              "input.location-input::-webkit-calendar-picker-indicator{display:none!important}" +
              // 日期条上的空备注：平时完全看不见，鼠标移上去才浮出一条虚线。
              // 这条必须是 CSS 的 :hover，不能用 React state —— 点进去编辑时这个
              // div 被输入框换掉了，鼠标移走时它已经不在，onMouseLeave 永远不会
              // 触发，hover 就永久卡在 true，虚线赖着不走
              ".day-note-empty:hover{border-bottom-color:var(--border-strong)}" +
              ".day-note-empty.day-note-peak:hover{border-bottom-color:var(--peak-hint)}" +
              // 表单控件跟着主题走。原生控件默认是浅色的，暗色下会白得刺眼
              "input,select,textarea,button{font:inherit;color:var(--text);background:var(--surface)}" +
              // 弹框背后压一层。浏览器默认的 ::backdrop 才 10% 黑，暗色下几乎
              // 看不出框和页面的界线
              "dialog::backdrop{background:rgba(0,0,0,.45)}" +
              // 分配态里撤销资源的那个叉：平时看不见也点不到，鼠标移到这个资源上
              // 才浮出来。它是绝对定位的，所以出现/消失都不挤动别的东西 ——
              // 原来它老老实实排在名字后面，一进分配模式后面全右移 14px
              ".assign-card-x{opacity:0;pointer-events:none;transition:opacity .12s}" +
              ".assign-card:hover .assign-card-x{opacity:1;pointer-events:auto}" +
              "input[type=date]::-webkit-calendar-picker-indicator{filter:var(--picker-filter,none)}" +
              ':root[data-theme="dark"]{--picker-filter:invert(1) opacity(.6)}' +
              "@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){--picker-filter:invert(1) opacity(.6)}}",
          }}
        />
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
