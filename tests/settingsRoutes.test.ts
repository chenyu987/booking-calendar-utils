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

beforeEach(() => {
  vi.resetModules();
  seed();
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
    expect(fake.db.app_settings[0].value).toBe(String(MAX_BAND_DAYS));

    await bandDays({ days: -5 });
    expect(fake.db.app_settings[0].value).toBe(String(MIN_BAND_DAYS));
  });

  it("范围内的原样存", async () => {
    await bandDays({ days: 11 });
    expect(fake.db.app_settings[0].value).toBe("11");
    // 一个 key 只有一行，改来改去不会堆出好几行
    expect(fake.db.app_settings).toHaveLength(1);
  });

  it("小数往下取整，不会存成 10.7 让日历切出半列", async () => {
    await bandDays({ days: 10.7 });
    expect(fake.db.app_settings[0].value).toBe("10");
  });

  it("不是数字 → 400", async () => {
    // null / [] / "" 这几个是重点：Number() 把它们都变成 0，能过 Number.isFinite，
    // 然后被 clamp 成最窄的 3 天悄悄存进去。必须在转数字**之前**按类型挡掉
    for (const days of ["abc", null, undefined, {}, [], "", "  ", true]) {
      const r = await bandDays({ days });
      expect(r.status, `days=${JSON.stringify(days)}`).toBe(400);
    }
    expect(fake.db.app_settings).toHaveLength(0);
  });

  it("数字装在字符串里也认（表单传上来就是字符串）", async () => {
    await bandDays({ days: "14" });
    expect(fake.db.app_settings[0].value).toBe("14");
  });

  it("库里没有这条设置时，读出来是默认的四周而不是上限", async () => {
    const { getOverviewBandDays } = await import("@/lib/appSettings");
    expect(await getOverviewBandDays()).toBe(DEFAULT_BAND_DAYS);
  });

  it("库里是脏值也不会把日历搞死", async () => {
    seed({ app_settings: [{ key: "overview_band_days", value: "自由发挥" }] });
    const { getOverviewBandDays } = await import("@/lib/appSettings");
    expect(await getOverviewBandDays()).toBe(DEFAULT_BAND_DAYS);
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
