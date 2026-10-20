import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getOverviewStart,
  setOverviewStart,
  getOverviewEnd,
  setOverviewEnd,
  getReferralRate,
  setReferralRate,
  getPrimaryAdminId,
  setPrimaryAdminId,
} from "@/lib/appSettings";
import { getBandDays, setBandDays } from "@/lib/bandDaysSetting";
import { resolvePrimaryAdmin } from "@/lib/admins";
import { isIsoDate } from "@/lib/timelineStart";
import { parseRatePercent } from "@/lib/referral";
import { loadAdmins } from "@/lib/personContacts";

// 设置的读写。原来是一个页面，现在改成弹框，所以这儿只留数据接口。
//
// GET 给弹框打开时拉当前值 —— 不放进 admin layout 预取，那样每开一个 admin
// 页面都要多跑两条查询，而设置十天半月才点一次。
export async function GET() {
  const [start, end, bandDays, rate, admins, primaryRaw] = await Promise.all([
    getOverviewStart(),
    getOverviewEnd(),
    getBandDays("overview"),
    getReferralRate(),
    loadAdmins(),
    getPrimaryAdminId(),
  ]);
  return NextResponse.json({
    overview_start: start,
    overview_end: end,
    // 这一项是 cookie 里的（这台电脑的），别的都在库里
    band_days: bandDays,
    // 库里存小数（0.1），界面上填百分数
    referral_rate: Math.round(rate * 10000) / 100,
    // 只读带出来给弹框画列表；增和改名走 /admin/admins
    admins,
    primary_admin_id: resolvePrimaryAdmin(primaryRaw, admins),
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body 不是合法 JSON" }, { status: 400 });
  }

  // 起始 / 结束日期：空 = 回到默认。填了但不是真实存在的日子就拒绝 ——
  // 放进去之后日历会从一个谁也说不清的地方开始（new Date 把 2/31 滚到 3 月）。
  // **两个都先验完再写**：结束早于开始的话一项都不存，半存半不存最难查
  const dateField = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";
  const startRaw = dateField("overview_start");
  const endRaw = dateField("overview_end");
  for (const raw of [startRaw, endRaw]) {
    if (raw && !isIsoDate(raw)) {
      return NextResponse.json(
        { error: "日期不对：要么留空（回到默认），要么填一个真实存在的日子" },
        { status: 400 }
      );
    }
  }
  // 只有这一次两个都提交了才比得了；只改一头的时候，另一头拿库里现存的比
  if ("overview_start" in body || "overview_end" in body) {
    const start = "overview_start" in body ? startRaw : (await getOverviewStart()) ?? "";
    const end = "overview_end" in body ? endRaw : (await getOverviewEnd()) ?? "";
    if (start && end && end < start) {
      return NextResponse.json({ error: "结束日期早于开始日期" }, { status: 400 });
    }
  }
  if ("overview_start" in body) await setOverviewStart(startRaw || null);
  if ("overview_end" in body) await setOverviewEnd(endRaw || null);

  // 每行几天：超范围的不报错、直接夹住 —— 这个值也能靠拖拽改，拖到头本来就是
  // 夹住，两条路的行为得一样。但**类型**要先挡：Number(null)/Number("") 都是 0，
  // 能过 isFinite，然后被夹成最窄的 3 天悄悄存进去
  if ("band_days" in body) {
    const v = body.band_days;
    const n =
      typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "每行几天不是数字" }, { status: 400 });
    }
    await setBandDays("overview", n);
  }

  // 介绍人返点的全局默认比例。校验走 lib/referral.ts 的 parseRatePercent
  // （唯一出处）—— 页面上那个入口原来自己判断了一遍，现在只剩这一份。
  // **空着不算「不设限」**：全局默认必须有个值，不然新建关系时无从取值
  if ("referral_rate" in body) {
    const parsed = parseRatePercent(body.referral_rate);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.reason }, { status: 400 });
    }
    if (parsed.rate === null) {
      return NextResponse.json({ error: "全局默认比例不能空着" }, { status: 400 });
    }
    await setReferralRate(parsed.rate);
    revalidatePath("/admin/referrals");
  }

  // 主要管理员：必须是名单里真有的人。存一个不存在的 id 的话，排期总览上
  // 「没写是谁的单」就没了归属，全变成「没标」，而且看不出是哪儿来的
  if ("primary_admin_id" in body) {
    const id = typeof body.primary_admin_id === "string" ? body.primary_admin_id : "";
    if (!resolvePrimaryAdmin(id, await loadAdmins())) {
      return NextResponse.json({ error: "主要管理员得是名单里的人，刷新页面再试" }, { status: 400 });
    }
    await setPrimaryAdminId(id);
  }

  revalidatePath("/admin/overview");
  return NextResponse.json({ ok: true });
}
