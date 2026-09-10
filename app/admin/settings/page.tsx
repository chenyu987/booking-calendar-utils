import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOverviewStart, setOverviewStart } from "@/lib/appSettings";
import { isIsoDate } from "@/lib/timelineStart";

export const dynamic = "force-dynamic";

// 后台设置。跟筛选不一样：筛选是「这一眼我想看什么」，走 URL 参数，看完就没了；
// 设置是「以后每次进来都这样」，所以存库（app_settings），换台机器也一致。
async function saveSettings(formData: FormData) {
  "use server";

  const raw = ((formData.get("overview_start") as string) ?? "").trim();
  // 空 = 回到默认（最早的单子附近）。填了但不是合法日子的一律拒绝，
  // 不然存进去之后日历从一个谁也说不清的地方开始
  if (raw && !isIsoDate(raw)) redirect("/admin/settings?error=date");

  await setOverviewStart(raw || null);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/overview");
  redirect("/admin/settings?saved=1");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const overviewStart = await getOverviewStart();

  return (
    <main>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>设置</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        这里改的是「以后每次进来都这样」，存在库里，换台机器也一样。
        缩放、面板收起、每行排几天那些是各自机器上的习惯，不在这儿。
      </p>

      {searchParams.saved && (
        <p style={{ color: "#1f5c33", fontSize: 13 }}>已保存。</p>
      )}
      {searchParams.error === "date" && (
        <p style={{ color: "#c0392b", fontSize: 13 }}>
          日期不对，没存。要么留空（回到默认），要么填一个真实存在的日子。
        </p>
      )}

      <form action={saveSettings} style={{ maxWidth: 460, marginTop: 16 }}>
        <section style={sectionStyle}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>排期总览：日历从哪天开始</div>
          <p style={hintStyle}>
            留空就是默认：从最早的单子（或今天，看哪个更早）往前一点开始。
            补录历史单、或者只想看季后半段的时候，在这儿定一个日子，
            以后每次进排期总览都从那天开始。
          </p>
          <input
            // key 让保存后的新值能顶掉输入框里的旧值（defaultValue 只在挂载时读一次）
            key={`start-${overviewStart ?? ""}`}
            type="date"
            name="overview_start"
            defaultValue={overviewStart ?? ""}
            style={inputStyle}
          />
        </section>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button type="submit" style={buttonStyle}>
            保存
          </button>
          <Link href="/admin/overview" style={{ fontSize: 13, color: "#1c4e78" }}>
            去排期总览看看 →
          </Link>
        </div>
      </form>
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 6,
  padding: "12px 14px",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  lineHeight: 1.6,
  margin: "4px 0 10px",
};
const inputStyle: React.CSSProperties = {
  padding: 6,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  border: "none",
  background: "#111",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
