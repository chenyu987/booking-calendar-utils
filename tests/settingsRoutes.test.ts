import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";
import { MIN_BAND_DAYS, MAX_BAND_DAYS, DEFAULT_BAND_DAYS } from "@/lib/bandDays";

// 日期备注和「每行几天」这两条 Route Handler 的集成测试。
// 都是「界面上随手一改就落库」的路径，所以坏输入必须在服务端挡住 ——
// 这两条谁都能直接 curl，界面拦不算数。

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

let fake: ReturnType<typeof createFakeSupabase>;
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

// 「每行几天」存 cookie（lib/bandDaysSetting.ts），不进库。这里拿一个内存里的罐子顶掉
// next/headers：route 写进去的，下一次读得到 —— 跟浏览器带着 cookie 回来一个效果
let jar: Map<string, string>;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

function seed(tables = {}) {
  fake = createFakeSupabase({ day_notes: [], app_settings: [], ...tables });
  (globalThis as any).__fakeSupabase = fake.client;
}

// 每个 handler 单独静态引一次：路径带 `@/` 别名，拼进 Request 的 URL 里
// 会变成不合法的地址，所以 URL 跟模块分开
async function post(
  // handler 的签名是 NextRequest，测试里给的是标准 Request（结构上够用），
  // 所以这里松一点，调用处再 as 一下
  load: () => Promise<{ POST: (r: any) => Promise<Response> }>,
  path: string,
  body: unknown
) {
  const { POST } = await load();
  const req = new Request(`http://test${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req as any);
  return { status: res.status, json: await res.json() };
}

const dayNote = (body: unknown) =>
  post(() => import("@/app/admin/overview/day-note/route"), "/admin/overview/day-note", body);
const bandDays = (body: unknown) =>
  post(() => import("@/app/admin/overview/band-days/route"), "/admin/overview/band-days", body);
const referralBandDays = (body: unknown) =>
  post(() => import("@/app/admin/referrals/band-days/route"), "/admin/referrals/band-days", body);
const saveSettings = (body: unknown) =>
  post(() => import("@/app/admin/settings/route"), "/admin/settings", body);

beforeEach(() => {
  vi.resetModules();
  seed();
  jar = new Map();
});

describe("这一天的备注", () => {
  it("写一条", async () => {
    const r = await dayNote({ day: "2026-12-26", note: "圣诞档，限制资源进不去" });
    expect(r.status).toBe(200);
    expect(fake.db.day_notes).toHaveLength(1);
    expect(fake.db.day_notes[0]).toMatchObject({
      day: "2026-12-26",
      note: "圣诞档，限制资源进不去",
    });
  });

  it("同一天再写一次是覆盖，不是多出一行", async () => {
    await dayNote({ day: "2026-12-26", note: "第一版" });
    await dayNote({ day: "2026-12-26", note: "第二版" });
    expect(fake.db.day_notes).toHaveLength(1);
    expect(fake.db.day_notes[0].note).toBe("第二版");
  });

  it("清空 = 删掉整行，不是存一个空字符串", async () => {
    await dayNote({ day: "2026-12-26", note: "写点什么" });
    const r = await dayNote({ day: "2026-12-26", note: "   " });
    expect(r.status).toBe(200);
    expect(fake.db.day_notes).toHaveLength(0);
  });

  it("日期格式不对 → 400，不能拿去当主键", async () => {
    for (const day of ["", "2026-9-10", "12/26/2026", "乱写"]) {
      const r = await dayNote({ day, note: "x" });
      expect(r.status, `day=${day}`).toBe(400);
    }
    expect(fake.db.day_notes).toHaveLength(0);
  });

  it("body 不是 JSON → 400", async () => {
    expect((await dayNote("nope")).status).toBe(400);
  });
});

describe("每行几天", () => {
  it("存下来的是夹到范围内的值，不是原样", async () => {
    await bandDays({ days: 999 });
    expect(jar.get("overview_band_days")).toBe(String(MAX_BAND_DAYS));

    await bandDays({ days: -5 });
    expect(jar.get("overview_band_days")).toBe(String(MIN_BAND_DAYS));
  });

  it("范围内的原样存", async () => {
    await bandDays({ days: 11 });
    expect(jar.get("overview_band_days")).toBe("11");
  });

  it("小数往下取整，不会存成 10.7 让日历切出半列", async () => {
    await bandDays({ days: 10.7 });
    expect(jar.get("overview_band_days")).toBe("10");
  });

  it("不是数字 → 400", async () => {
    // null / [] / "" 这几个是重点：Number() 把它们都变成 0，能过 Number.isFinite，
    // 然后被 clamp 成最窄的 3 天悄悄存进去。必须在转数字**之前**按类型挡掉
    for (const days of ["abc", null, undefined, {}, [], "", "  ", true]) {
      const r = await bandDays({ days });
      expect(r.status, `days=${JSON.stringify(days)}`).toBe(400);
    }
    expect(jar.size).toBe(0);
  });

  it("数字装在字符串里也认（表单传上来就是字符串）", async () => {
    await bandDays({ days: "14" });
    expect(jar.get("overview_band_days")).toBe("14");
  });

  it("**不进库** —— 两个管理员各用各的，存库就互相改对方的", async () => {
    await bandDays({ days: 14 });
    expect(fake.db.app_settings).toHaveLength(0);
  });

  it("没设过时，读出来是默认的四周而不是上限", async () => {
    const { getBandDays } = await import("@/lib/bandDaysSetting");
    expect(await getBandDays("overview")).toBe(DEFAULT_BAND_DAYS);
  });

  it("cookie 是脏值也不会把日历搞死", async () => {
    jar.set("overview_band_days", "自由发挥");
    const { getBandDays } = await import("@/lib/bandDaysSetting");
    expect(await getBandDays("overview")).toBe(DEFAULT_BAND_DAYS);
  });

  it("库里还留着老的那条也不认 —— 读的只有这台电脑的 cookie", async () => {
    seed({ app_settings: [{ key: "overview_band_days", value: "14" }] });
    const { getBandDays } = await import("@/lib/bandDaysSetting");
    expect(await getBandDays("overview")).toBe(DEFAULT_BAND_DAYS);
  });
});

describe("起始日期这条设置", () => {
  it("存进去、读出来是同一个", async () => {
    const { setOverviewStart, getOverviewStart } = await import("@/lib/appSettings");
    await setOverviewStart("2026-12-01");
    expect(await getOverviewStart()).toBe("2026-12-01");
  });

  it("传 null 是清掉这条设置", async () => {
    const { setOverviewStart, getOverviewStart } = await import("@/lib/appSettings");
    await setOverviewStart("2026-12-01");
    await setOverviewStart(null);
    expect(fake.db.app_settings).toHaveLength(0);
    expect(await getOverviewStart()).toBeNull();
  });

  it("**库里存了个不存在的日子也当没设** —— 不然 new Date 会把 2/31 滚到 3 月", async () => {
    seed({ app_settings: [{ key: "overview_start", value: "2026-02-31" }] });
    const { getOverviewStart } = await import("@/lib/appSettings");
    expect(await getOverviewStart()).toBeNull();
  });
});

describe("设置弹框那条接口", () => {
  it("读回来的是库里的值（每行几天是这台电脑 cookie 里的）", async () => {
    seed({ app_settings: [{ key: "overview_start", value: "2026-12-01" }] });
    jar.set("overview_band_days", "14");
    const { GET } = await import("@/app/admin/settings/route");
    const json = await (await GET()).json();
    // referral_rate 没设过 → 回默认 10（百分数，库里存的是 0.1）
    expect(json).toEqual({
      overview_start: "2026-12-01",
      overview_end: null,
      band_days: 14,
      referral_rate: 10,
      admins: [],
      primary_admin_id: null,
    });
  });

  it("一次存两项", async () => {
    const r = await saveSettings({ overview_start: "2026-12-01", band_days: "14" });
    expect(r.status).toBe(200);
    const rows = Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]));
    expect(rows).toEqual({ overview_start: "2026-12-01" });
    expect(jar.get("overview_band_days")).toBe("14");
  });

  it("起始日期留空 = 清掉这条设置", async () => {
    await saveSettings({ overview_start: "2026-12-01" });
    await saveSettings({ overview_start: "" });
    expect(fake.db.app_settings.find((x: any) => x.key === "overview_start")).toBeUndefined();
  });

  it("结束日期存进去、留空清掉", async () => {
    await saveSettings({ overview_start: "2026-12-01", overview_end: "2027-03-31" });
    const rows = Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]));
    expect(rows).toEqual({ overview_start: "2026-12-01", overview_end: "2027-03-31" });
    await saveSettings({ overview_end: "" });
    expect(fake.db.app_settings.find((x: any) => x.key === "overview_end")).toBeUndefined();
  });

  it("**结束早于开始就整个拒掉**，一项都不存", async () => {
    const r = await saveSettings({ overview_start: "2027-01-10", overview_end: "2027-01-09" });
    expect(r.status).toBe(400);
    expect(fake.db.app_settings).toHaveLength(0);
  });

  it("只改一头时，拿库里现存的另一头比", async () => {
    seed({ app_settings: [{ key: "overview_start", value: "2027-01-10" }] });
    const r = await saveSettings({ overview_end: "2027-01-09" });
    expect(r.status).toBe(400);
    expect(fake.db.app_settings.find((x: any) => x.key === "overview_end")).toBeUndefined();
  });

  it("结束日期不存在的日子也拒掉", async () => {
    expect((await saveSettings({ overview_end: "2027-02-31" })).status).toBe(400);
  });

  it("**日子不存在就整个拒掉**，别让日历从一个说不清的地方开始", async () => {
    const r = await saveSettings({ overview_start: "2026-02-31", band_days: "14" });
    expect(r.status).toBe(400);
    // 拒了就一项都别存 —— 半存半不存最难查
    expect(fake.db.app_settings).toHaveLength(0);
    expect(jar.size).toBe(0);
  });

  it("每行几天：超范围夹住，坏类型拒掉", async () => {
    await saveSettings({ band_days: 999 });
    expect(jar.get("overview_band_days")).toBe(String(MAX_BAND_DAYS));

    for (const band_days of [null, "", [], {}, true]) {
      expect((await saveSettings({ band_days })).status).toBe(400);
    }
  });

  it("body 不是 JSON → 400", async () => {
    expect((await saveSettings("nope")).status).toBe(400);
  });
});


describe("设置：介绍人返点的全局默认比例", () => {
  it("存进去的是小数，界面填的是百分数", async () => {
    seed({ app_settings: [] });
    const r = await saveSettings({ referral_rate: "7.5" });
    expect(r.status).toBe(200);
    expect(Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]))).toEqual({ referral_rate_default: "0.075" });
  });

  it("不是数字要拒绝 —— 界面挡不住直接 POST", async () => {
    seed({ app_settings: [] });
    const r = await saveSettings({ referral_rate: "一成" });
    expect(r.status).toBe(400);
    // 一个字都没写进去
    expect(Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]))).toEqual({});
  });

  it("超出 0~100 要拒绝", async () => {
    seed({ app_settings: [] });
    expect((await saveSettings({ referral_rate: "-1" })).status).toBe(400);
    expect((await saveSettings({ referral_rate: "101" })).status).toBe(400);
    expect(Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]))).toEqual({});
  });

  it("空着要拒绝 —— 全局默认必须有个值，不然新建关系时无从取值", async () => {
    seed({ app_settings: [] });
    const r = await saveSettings({ referral_rate: "" });
    expect(r.status).toBe(400);
    expect(Object.fromEntries(fake.db.app_settings.map((x: any) => [x.key, x.value]))).toEqual({});
  });
});


describe("返点日历：拖右边那根条改每行几天", () => {
  const key = () => jar.get("referral_band_days");

  it("正常存进去", async () => {
    const r = await referralBandDays({ days: 14 });
    expect(r.status).toBe(200);
    expect(key()).toBe("14");
  });

  it("超范围夹住 —— 拖到头本来就是夹住，两条路行为要一样", async () => {
    await referralBandDays({ days: 999 });
    expect(key()).toBe(String(MAX_BAND_DAYS));
  });

  it("**坏类型要拒掉，不能被 Number() 悄悄变成 0 再夹成最窄**", async () => {
    // Number(null) / Number([]) / Number("") 都是 0，都能过 isFinite，
    // 然后被夹成 3 天存进去 —— 一个坏请求把日历压成最窄，还什么都不报
    for (const days of [null, "", [], {}, true]) {
      const r = await referralBandDays({ days });
      expect(r.status).toBe(400);
    }
    expect(key()).toBeUndefined();
  });

  it("body 不是 JSON 也拒掉", async () => {
    const r = await referralBandDays("不是 json");
    expect(r.status).toBe(400);
  });

  it("**跟排期总览各存各的** —— 改一张不该动另一张", async () => {
    await referralBandDays({ days: 7 });
    expect(jar.has("overview_band_days")).toBe(false);
  });

  it("没设过时是返点日历自己的默认 14，cookie 脏了也退回 14 而不是总览的 28", async () => {
    const { getBandDays } = await import("@/lib/bandDaysSetting");
    expect(await getBandDays("referral")).toBe(14);
    jar.set("referral_band_days", "abc");
    expect(await getBandDays("referral")).toBe(14);
  });
});

describe("主要管理员", () => {
  const ADMINS = [
    { id: "a-admin1", name: "Admin1", created_at: "1" },
    { id: "a-admin2", name: "admin2", created_at: "2" },
  ];

  it("设成名单里的人", async () => {
    seed({ admins: ADMINS });
    const r = await saveSettings({ primary_admin_id: "a-admin2" });
    expect(r.status).toBe(200);
    expect(fake.db.app_settings.find((x: any) => x.key === "primary_admin_id")?.value).toBe("a-admin2");
  });

  it("**不在名单里的 id 拒掉**，一个字都不写", async () => {
    seed({ admins: ADMINS });
    expect((await saveSettings({ primary_admin_id: "a-gone" })).status).toBe(400);
    expect((await saveSettings({ primary_admin_id: "" })).status).toBe(400);
    expect(fake.db.app_settings).toHaveLength(0);
  });

  it("读出来时库里那个 id 对不上任何人（手工改坏了）就当没设", async () => {
    seed({ admins: ADMINS, app_settings: [{ key: "primary_admin_id", value: "a-gone" }] });
    const { GET } = await import("@/app/admin/settings/route");
    expect((await (await GET()).json()).primary_admin_id).toBeNull();
  });
});
