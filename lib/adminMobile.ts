// admin 后台在手机窄屏下的布局。
//
// 桌面是「侧边栏 | 内容 | 对外页面」三栏横排，两边都是鼠标拖宽度的。手机上
// 两边加起来就把 400px 宽的屏幕吃光了，内容被挤成一个字一列，而且手指拖不动那两根条。
// 所以窄屏下：
//   · 侧边栏变成左边滑出来的抽屉，顶上一条带 ☰ 的顶栏（开关状态在 ResizableNav）
//   · 「对外页面」那道帘子直接藏掉（总览那道 OutsideRail 也是）—— 那两个资源片手机上用不着
//   · 内容占满宽度；宽表格包 <MobileScroll>，在自己的框里横滑，不把整页撑宽
//
// 只有 CSS、只在 @media 里：桌面上一条规则都不命中，样子一点不变。
// 抽屉宽度要压过 ResizableNav 内联的 width（来自 cookie），所以带 !important。
export const MOBILE_BREAKPOINT = 768;

// 拼成数组再 join，不用 `模板串` + "..." 连加：Next 的编译器把那种写法常量折叠时
// 吞掉了中间一大段（实测产物里只剩 `@media (max-width:768.admin-main>main…`），整条规则失效
export const ADMIN_MOBILE_CSS = [
  "@media (max-width:" + MOBILE_BREAKPOINT + "px){",
  ".admin-shell{flex-direction:column}",
  ".admin-topbar{display:flex!important;align-items:center;gap:10px;position:sticky;top:0;z-index:900;" +
    "padding:8px 10px;background:var(--bg);border-bottom:1px solid var(--border)}",
  ".admin-nav{position:fixed;top:0;left:0;bottom:0;z-index:1001;width:240px!important;" +
    "overflow-y:auto!important;background:var(--bg);border-right:1px solid var(--border);" +
    "transform:translateX(-100%);transition:transform .2s ease;visibility:hidden}",
  ".admin-nav[data-open]{transform:none;visibility:visible}",
  ".admin-nav-backdrop[data-open]{display:block!important;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.35)}",
  ".admin-nav-handle,.public-rail{display:none!important}",
  ".admin-main{overflow-x:auto}",
  // 宽表格包在 <MobileScroll> 里（app/admin/MobileScroll.tsx）：表格保持自己要的宽度，
  // 在框里左右滑；表格外面的标题、表单照屏宽排、会换行
  ".m-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}",
  ".m-scroll-inner{min-width:var(--m-min)}",
  // 输入框 / 下拉别超过屏宽（Match 页那个「选 Resource」下拉选项很长，会把框撑出屏外）
  ".admin-main select,.admin-main input{max-width:100%}",
  // 排期总览：筛选那一排换行；资源面板展开时浮在日历上，收起后只剩那根 14px 的条
  ".ov-filters,.ov-filters>form{flex-wrap:wrap}",
  "#resource-panel[data-expanded]{position:fixed;top:45px;left:0;bottom:0;z-index:800;" +
    "width:min(320px,88vw)!important;margin:0!important;padding:10px;box-sizing:border-box;" +
    "overflow-y:auto;background:var(--bg);border-right:1px solid var(--border);box-shadow:4px 0 16px rgba(0,0,0,.15)}",
  "}",
].join("");
