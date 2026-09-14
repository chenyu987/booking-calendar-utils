// 对外页面的入口。首页和排期总览右边那道帘子共用同一份，
// 加一个页面只改这里，不会出现「首页有、帘子里没有」。
export const PUBLIC_LINKS = [
  { href: "/customer", label: "我要租借", desc: "Customer 登录后发需求、看自己的订单" },
  // 物主只有一个落脚点：看需求提意向、挂资源、改资料全在 /provider
  { href: "/provider", label: "我有资源", desc: "Provider 登录后挂资源、看需求、提意向" },
] as const;
