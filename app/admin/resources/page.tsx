import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { calcAge } from "@/lib/age";
import { formatDayRanges } from "@/lib/dates";
import { STATUS_LABELS as ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import FilterForm from "../orders/FilterForm";
import {
  parseResourceFilters,
  hasAnyResourceFilter,
  matchesResourceFilters,
} from "@/lib/resourceFilter";
import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_LABELS,
  VALIDITY_OPEN_LABEL,
  statusBadge,
} from "@/lib/resourceStatus";
import {
  formStyle,
  inputStyle,
  selectStyle,
  buttonStyle,
  pageTitleStyle,
  helpTextStyle,
  rowStyle,
  headerRowStyle,
  cellStyle,
  linkButtonStyle,
  dangerLinkStyle,
} from "@/lib/adminStyles";

export const dynamic = "force-dynamic";

function genderLabel(g?: string | null) {
  return g === "male" ? "男" : g === "female" ? "女" : "-";
}

async function createResource(formData: FormData) {
  "use server";
  const providerId = formData.get("provider_id") as string;
  if (!providerId) throw new Error("必须选一个 Provider");

  const { error } = await supabase.from("resources").insert({
    provider_id: providerId,
    item_type: formData.get("item_type") as string,
    holder_name: (formData.get("holder_name") as string)?.trim() || null,
    holder_gender: (formData.get("holder_gender") as string) || null,
    holder_date_of_birth: (formData.get("holder_date_of_birth") as string) || null,
    // 有效期两头各自选填，留空 = 这一头不设限（见 lib/resourceStatus.ts）
    date_range_start: (formData.get("date_range_start") as string) || null,
    date_range_end: (formData.get("date_range_end") as string) || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
}

async function updateResource(formData: FormData) {
  "use server";
  const { error } = await supabase
    .from("resources")
    .update({
      provider_id: formData.get("provider_id") as string,
      item_type: formData.get("item_type") as string,
      holder_name: (formData.get("holder_name") as string)?.trim() || null,
      holder_gender: (formData.get("holder_gender") as string) || null,
      holder_date_of_birth: (formData.get("holder_date_of_birth") as string) || null,
      date_range_start: (formData.get("date_range_start") as string) || null,
      date_range_end: (formData.get("date_range_end") as string) || null,
      status: formData.get("status") as string,
    })
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
  redirect("/admin/resources");
}

async function deleteResource(formData: FormData) {
  "use server";
  const { error } = await supabase
    .from("resources")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
}

// 筛选行的控件比新增表单里的紧凑：11 列挤在一行。
// boxSizing 不能少——inputStyle 带内边距和边框，默认 content-box 的话 width:100%
// 会比同格的 <select>（浏览器默认 border-box）宽出十几像素，右边对不齐。
const filterInputStyle = {
  ...inputStyle,
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "3px 5px",
  fontSize: 12,
};

export default async function ResourcesAdminPage({
  searchParams,
}: {
  // 逐列筛选走 URL 参数，跟 ?edit= 一个路子：能收藏、能分享、刷新不丢
  searchParams: {
    edit?: string;
    provider?: string;
    item?: string;
    holder?: string;
    gender?: string;
    agemin?: string;
    agemax?: string;
    vfrom?: string;
    vto?: string;
    booked?: string;
    sstatus?: string;
  };
}) {
  const [{ data: resources, error }, { data: providers }, { data: assignments }] =
    await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase.from("providers").select("id, first_name, last_name"),
      supabase
        .from("order_assignments")
        .select(
          "resource_id, orders(id, location, demand_days, status, customers(first_name, last_name))"
        ),
    ]);

  // 每个资源的排期历史：这个资源都被哪些订单、在哪几天、去哪个地点用过
  const bookingsByResource = new Map<string, any[]>();
  for (const a of assignments ?? []) {
    const o: any = (a as any).orders;
    if (!o) continue;
    bookingsByResource.set(a.resource_id, [
      ...(bookingsByResource.get(a.resource_id) ?? []),
      o,
    ]);
  }

  const editingId = searchParams.edit;
  const providerName = (id: string) => {
    const o = providers?.find((x: any) => x.id === id);
    return o ? `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() : "-";
  };

  // 逐列筛选。年龄是从生日现算的，所以在内存里筛——写进 SQL 就得在两处
  // 维护同一套算法，正是 CLAUDE.md 反复警告的那个模式。一季几十个资源，不心疼。
  const filters = parseResourceFilters(searchParams);
  const filtering = hasAnyResourceFilter(filters);
  const visibleResources = (resources ?? []).filter((s: any) =>
    matchesResourceFilters(
      {
        providerName: providerName(s.provider_id),
        itemType: s.item_type,
        holderName: s.holder_name,
        holderGender: s.holder_gender,
        age: calcAge(s.holder_date_of_birth),
        rangeStart: s.date_range_start,
        rangeEnd: s.date_range_end,
        bookingCount: (bookingsByResource.get(s.id) ?? []).length,
        status: s.status,
      },
      filters
    )
  );

  return (
    <main>
      <h1 style={pageTitleStyle}>Resource 管理</h1>
      <p style={helpTextStyle}>
        一个 Provider 可以挂多个人的资源，一个资源挂一行。
      </p>

      <form action={createResource} style={formStyle}>
        <select name="provider_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Provider *
          </option>
          {providers?.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.first_name} {o.last_name}
            </option>
          ))}
        </select>
        <select name="item_type" style={selectStyle} defaultValue="beta">
          <option value="beta">beta</option>
          <option value="alpha">alpha</option>
        </select>
        <input name="holder_name" placeholder="物主姓名" style={inputStyle} />
        <select name="holder_gender" style={selectStyle} defaultValue="">
          <option value="">物主性别</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
        <input
          name="holder_date_of_birth"
          type="date"
          title="物主生日"
          style={inputStyle}
        />
        <input
          name="date_range_start"
          type="date"
          title="有效期开始（选填，空 = 不设下限）"
          style={inputStyle}
        />
        <input
          name="date_range_end"
          type="date"
          title="有效期结束（选填，空 = 不设上限）"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          新增 Resource
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, flex: 1.1 }}>Provider</div>
        <div style={{ ...cellStyle, width: 70 }}>资源类型</div>
        <div style={{ ...cellStyle, flex: 1.1 }}>物主姓名</div>
        <div style={{ ...cellStyle, width: 60 }}>性别</div>
        <div style={{ ...cellStyle, width: 96 }}>物主生日</div>
        <div style={{ ...cellStyle, width: 70 }}>年龄</div>
        <div style={{ ...cellStyle, width: 130 }}>有效期起</div>
        <div style={{ ...cellStyle, width: 130 }}>有效期止</div>
        <div style={{ ...cellStyle, flex: 1.8 }}>排期（去过/要去的地点）</div>
        <div style={{ ...cellStyle, width: 110 }}>挂牌状态</div>
        <div style={{ ...cellStyle, width: 110 }}>操作</div>
      </div>

      {/* 逐列筛选：控件的 flex/width 跟表头一一对齐，就是表头下面的一行。
          没有「筛选」按钮——改一个条件就自动筛（复用 Order 那边的 FilterForm）。
          年龄和有效期那几列本来太窄放不下输入框，一并加宽了，表头/编辑态/展示
          都跟着改，列还是对齐的。 */}
      <FilterForm action="/admin/resources">
        <div style={{ ...rowStyle, background: "var(--surface-2)" }}>
          <div style={{ ...cellStyle, flex: 1.1 }}>
            <input name="provider" defaultValue={filters.provider} placeholder="Provider" style={filterInputStyle} />
          </div>
          <div style={{ ...cellStyle, width: 70 }}>
            <select name="item" defaultValue={filters.item} style={filterInputStyle}>
              <option value="">全部</option>
              <option value="beta">beta</option>
              <option value="alpha">alpha</option>
            </select>
          </div>
          <div style={{ ...cellStyle, flex: 1.1 }}>
            <input name="holder" defaultValue={filters.holder} placeholder="物主姓名" style={filterInputStyle} />
          </div>
          <div style={{ ...cellStyle, width: 60 }}>
            <select name="gender" defaultValue={filters.gender} style={filterInputStyle}>
              <option value="">全部</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          {/* 生日这一格不放控件：年龄就是从生日算出来的，两个都给反而让人纠结用哪个 */}
          <div style={{ ...cellStyle, width: 96, color: "var(--text-faint)", fontSize: 11 }}>按年龄筛 →</div>
          <div style={{ ...cellStyle, width: 70, display: "flex", alignItems: "center", gap: 2 }}>
            <input
              name="agemin"
              inputMode="numeric"
              defaultValue={filters.ageMin}
              title="最小年龄"
              placeholder="最小"
              style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
            />
            <span style={{ color: "var(--text-faint)", flexShrink: 0, fontSize: 11 }}>~</span>
            <input
              name="agemax"
              inputMode="numeric"
              defaultValue={filters.ageMax}
              title="最大年龄"
              placeholder="最大"
              style={{ ...filterInputStyle, flex: 1, minWidth: 0 }}
            />
          </div>
          <div style={{ ...cellStyle, width: 130 }}>
            <input type="date" name="vfrom" defaultValue={filters.validFrom} title="有效期起：不早于这天" style={filterInputStyle} />
          </div>
          <div style={{ ...cellStyle, width: 130 }}>
            <input type="date" name="vto" defaultValue={filters.validTo} title="有效期止：不晚于这天" style={filterInputStyle} />
          </div>
          <div style={{ ...cellStyle, flex: 1.8 }}>
            <select name="booked" defaultValue={filters.booked} style={filterInputStyle}>
              <option value="">全部</option>
              <option value="yes">有排期</option>
              <option value="no">完全没排（空资源）</option>
            </select>
          </div>
          <div style={{ ...cellStyle, width: 110 }}>
            <select name="sstatus" defaultValue={filters.sstatus} style={filterInputStyle}>
              <option value="">全部状态</option>
              {RESOURCE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {RESOURCE_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              ...cellStyle,
              width: 110,
              color: "var(--text-faint)",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {filtering ? (
              <>
                <span style={{ color: "var(--warn)" }}>{visibleResources.length} 张</span>
                <Link href="/admin/resources" style={linkButtonStyle}>
                  清除
                </Link>
              </>
            ) : (
              "选完自动筛"
            )}
          </div>
        </div>
      </FilterForm>

      {filtering && visibleResources.length === 0 && (
        <p style={{ ...helpTextStyle, margin: "6px 0" }}>
          共 {resources?.length ?? 0} 个资源，没有符合条件的——放宽一点试试
        </p>
      )}

      {visibleResources.map((s: any) =>
        s.id === editingId ? (
          <form key={s.id} action={updateResource} style={rowStyle}>
            <input type="hidden" name="id" value={s.id} />
            <div style={{ ...cellStyle, flex: 1.1 }}>
              <select
                name="provider_id"
                defaultValue={s.provider_id}
                style={{ ...selectStyle, width: "100%" }}
              >
                {providers?.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.first_name} {o.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...cellStyle, width: 70 }}>
              <select
                name="item_type"
                defaultValue={s.item_type ?? "beta"}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="beta">beta</option>
                <option value="alpha">alpha</option>
              </select>
            </div>
            <div style={{ ...cellStyle, flex: 1.1 }}>
              <input
                name="holder_name"
                defaultValue={s.holder_name ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 60 }}>
              <select
                name="holder_gender"
                defaultValue={s.holder_gender ?? ""}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="">-</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            <div style={{ ...cellStyle, width: 96 }}>
              <input
                name="holder_date_of_birth"
                type="date"
                defaultValue={s.holder_date_of_birth ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 70, color: "var(--text-faint)" }}>自动</div>
            <div style={{ ...cellStyle, width: 130 }}>
              <input
                name="date_range_start"
                type="date"
                title="空 = 不设下限"
                defaultValue={s.date_range_start ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 130 }}>
              <input
                name="date_range_end"
                type="date"
                title="空 = 不设上限"
                defaultValue={s.date_range_end ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1.8, color: "var(--text-faint)", fontSize: 11 }}>
              排期由订单决定，改不了
            </div>
            <div style={{ ...cellStyle, width: 110 }}>
              <select
                name="status"
                defaultValue={s.status}
                style={{ ...selectStyle, width: "100%" }}
              >
                {RESOURCE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {RESOURCE_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...cellStyle, width: 110, display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/admin/resources" style={linkButtonStyle}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <div key={s.id} style={rowStyle}>
            <div style={{ ...cellStyle, flex: 1.1 }}>{providerName(s.provider_id)}</div>
            <div style={{ ...cellStyle, width: 70 }}>{s.item_type ?? "-"}</div>
            <div style={{ ...cellStyle, flex: 1.1 }}>{s.holder_name ?? "-"}</div>
            <div style={{ ...cellStyle, width: 60 }}>
              {genderLabel(s.holder_gender)}
            </div>
            <div style={{ ...cellStyle, width: 96 }}>
              {s.holder_date_of_birth ?? "-"}
            </div>
            <div style={{ ...cellStyle, width: 70 }}>
              {calcAge(s.holder_date_of_birth) ?? "-"}
            </div>
            <div style={{ ...cellStyle, width: 130 }}>
              {s.date_range_start ?? (
                <span style={{ color: "var(--text-faint)" }}>{VALIDITY_OPEN_LABEL}</span>
              )}
            </div>
            <div style={{ ...cellStyle, width: 130 }}>
              {s.date_range_end ?? (
                <span style={{ color: "var(--text-faint)" }}>{VALIDITY_OPEN_LABEL}</span>
              )}
            </div>
            <div style={{ ...cellStyle, flex: 1.8 }}>
              {(() => {
                const bookings = (bookingsByResource.get(s.id) ?? []).sort(
                  (a: any, b: any) =>
                    (a.demand_days?.[0] ?? "") < (b.demand_days?.[0] ?? "") ? -1 : 1
                );
                return (
                  <>
                    {bookings.length === 0 ? (
                      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>还没排过</span>
                    ) : (
                      bookings.map((o: any) => (
                        <div key={o.id} style={{ fontSize: 12, lineHeight: 1.5 }}>
                          <span style={{ color: "var(--link)" }}>
                            {formatDayRanges(o.demand_days ?? [])}
                          </span>{" "}
                          {o.location ?? "?"}
                          <span style={{ color: "var(--text-faint)" }}>
                            {" "}
                            · {o.customers?.first_name ?? "?"} ·{" "}
                            {ORDER_STATUS_LABELS[o.status] ?? o.status}
                          </span>
                        </div>
                      ))
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ ...cellStyle, width: 110, color: statusBadge(s).color }}>
              {statusBadge(s).text}
            </div>
            <div style={{ ...cellStyle, width: 110, display: "flex", gap: 10 }}>
              <Link href={`/admin/resources?edit=${s.id}`} style={linkButtonStyle}>
                编辑
              </Link>
              <form action={deleteResource}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" style={dangerLinkStyle}>
                  删除
                </button>
              </form>
            </div>
          </div>
        )
      )}
    </main>
  );
}
