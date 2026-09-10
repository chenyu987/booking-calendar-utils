// 对外页面的入口。首页和排期总览右边那道帘子共用同一份，
// 加一个页面只改这里，不会出现「首页有、帘子里没有」。
export const PUBLIC_LINKS = [
  { href: "/customer", label: "我要租借", desc: "Customer 登录后发需求、看自己的订单" },
  { href: "/provider", label: "我有资源", desc: "Provider 登录后挂资源、看排期" },
  { href: "/provider/matches", label: "Provider 匹配台", desc: "物主看需求、提意向" },
] as const;
