// E2E 用的固定数据。
//
// 日期全部按「今天」算出来，不写死 —— 写死的话时间轴会随着日子推移越拉越长
// （页面的时间轴必须盖住今天），跑几个月之后色块就跑到屏幕外面去了，测试开始
// 莫名其妙地挂。
//
// 这批数据是**照着出过 bug 的场景**摆的：
//   · 名字有长有短（xhs / laura kim）—— 短名字暴露过 min-width 撑开的问题
//   · 有备注、有金额、配了两个资源 —— 三行都得有东西才比得出错位
//   · 有一个资源在本单之前用过、另一张只在之后用过 —— 「上一次」那条规则
//   · 至少两个单子，才测得了多选

import { seasonOf } from "../../lib/season";

function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// 排期总览默认只读今天这一季（lib/season.ts）。订单摆在今天前 5 天到后 20 天，
// 今天离季初 / 季末太近的时候会有单子掉进隔壁那季、页面上看不见 —— 测试一年里
// 有二十几天莫名其妙地挂。所以离边太近就整体往季里挪一点，保证全落在今天这季
const ORDER_FROM = -5;
const ORDER_TO = 20;
const SEASON = seasonOf(day(0));
const ORDER_SHIFT =
  day(ORDER_FROM) < SEASON.start
    ? Math.round((Date.parse(SEASON.start) - Date.parse(day(ORDER_FROM))) / 86_400_000)
    : day(ORDER_TO) > SEASON.end
      ? Math.round((Date.parse(SEASON.end) - Date.parse(day(ORDER_TO))) / 86_400_000)
      : 0;
/** 订单用的日子：跟 day() 一样按今天算，再挪进今天这一季 */
const orderDay = (offset: number) => day(offset + ORDER_SHIFT);

export const SEED = {
  // 人和身份分开（0017）：昵称、生日在 people，customers / providers 只是身份，id 跟人同一个。
  // 显示用的是昵称（0020）
  people: [
    { id: "r-long", chat_name: "laura kim", date_of_birth: null },
    // 三个字母，比输入框的 min-width 还窄 —— 专门用来盯「短名字把后面顶开」
    { id: "r-short", chat_name: "xhs", date_of_birth: null },
    { id: "r-aged", chat_name: "小明", date_of_birth: "1998-06-20" },
    { id: "o-1", chat_name: "测试物主" },
  ],
  customers: [{ id: "r-long" }, { id: "r-short" }, { id: "r-aged" }],
  // 排期总览标题旁边「当前身份」那个下拉的名单（0018）
  admins: [
    { id: "admin-admin1", name: "Admin1", created_at: "2026-01-01T00:00:00Z" },
    { id: "admin-admin2", name: "admin2", created_at: "2026-01-01T00:00:01Z" },
  ],
  person_contacts: [],
  providers: [{ id: "o-1" }],
  resources: [
    {
      id: "s-male",
      holder_photo_path: "s-male/1.jpg",
      provider_id: "o-1",
      holder_name: "jordan doe",
      holder_gender: "male",
      holder_date_of_birth: "1995-10-10",
      item_type: "alpha",
      status: "active",
      validity: [{ start: day(-200), end: day(200) }],
    },
    {
      id: "s-female",
      holder_photo_path: "s-female/1.jpg",
      provider_id: "o-1",
      holder_name: "sara lee",
      holder_gender: "female",
      holder_date_of_birth: "1995-09-10",
      item_type: "alpha",
      status: "active",
      validity: [{ start: day(-200), end: day(200) }],
    },
    {
      id: "s-later",
      provider_id: "o-1",
      holder_name: "zolan",
      holder_gender: "male",
      holder_date_of_birth: "1999-04-16",
      item_type: "alpha",
      status: "active",
      validity: [{ start: day(-200), end: day(200) }],
    },
  ],
  orders: [
    // 主角：三行都满（姓名·地点·备注 / 两个资源 / 男女进度·金额）
    {
      id: "ord-main",
      // 只有这一单标了管理员（0019），别的都是「没标」—— 管理员筛选那条测试靠它
      admin_id: "admin-admin1",
      customer_id: "r-long",
      location: "locbl",
      amount: 140,
      status: "itemAssigned",
      demand_days: [orderDay(3), orderDay(4)],
      male_count: 1,
      female_count: 1,
    },
    // 短名字那单
    {
      id: "ord-short",
      customer_id: "r-short",
      location: "locbm",
      amount: 160,
      status: "created",
      demand_days: [orderDay(6)],
      male_count: 1,
      female_count: 1,
    },
    // 用来测「上一次」：它在主角之前，且去的是同一片
    {
      id: "ord-earlier",
      customer_id: "r-aged",
      location: "locbn",
      amount: 80,
      status: "complete",
      demand_days: [orderDay(-5)],
      male_count: 1,
      female_count: 0,
    },
    // 排在主角之后 —— 按规则不该影响「上一次」
    {
      id: "ord-later",
      customer_id: "r-aged",
      location: "locbl",
      amount: 80,
      status: "created",
      demand_days: [orderDay(20)],
      male_count: 1,
      female_count: 0,
    },
    // 只给「删单」那条测试删的：删了就没了，别的测试别用它
    {
      id: "ord-doomed",
      customer_id: "r-short",
      location: "locbl",
      amount: 50,
      status: "created",
      demand_days: [orderDay(12)],
      male_count: 1,
      female_count: 0,
    },
  ],
  order_assignments: [
    // 主角只配了女资源：男资源那个缺口留着，jordan 才会以「候选」身份出现在
    // 左边面板里 —— 已经配上的资源显示的是「✓ 已配给这单」，看不到推荐徽章
    { id: "a2", order_id: "ord-main", resource_id: "s-female" },
    // jordan 在主角之前去过 locbn（B 区），跟 locbl 同一片
    { id: "a3", order_id: "ord-earlier", resource_id: "s-male" },
    // zolan 只在主角之后去过 —— 不该被算成「上一次」
    { id: "a4", order_id: "ord-later", resource_id: "s-later" },
  ],
  order_notes: [{ id: "n1", order_id: "ord-main", internal_note: "备注" }],
  payments: [],
  matches: [],
  day_notes: [],
  // 主要管理员 = admin2：没写是谁的单都算她的，她的单不上色；只有 Admin1 的（ord-main）带颜色
  app_settings: [{ key: "primary_admin_id", value: "admin-admin2" }],
};
