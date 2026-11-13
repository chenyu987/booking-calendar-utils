import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { personSpread } from "@/lib/people";
import { DISPLAY_COLUMNS, displayName } from "@/lib/person";
import { calcAge } from "@/lib/age";
import { DATE_INPUT_MAX, formatDayRanges } from "@/lib/dates";
import { summarizeBookings } from "@/lib/booking";
import { DELETE_BLOCKED_TEXT } from "@/lib/resourceEdit";
import { periodsFromFormData, serializeValidity, resourcePeriods, validitySpan } from "@/lib/validity";
import { deleteResource, restoreResource } from "./actions";
import FilterForm from "../orders/FilterForm";
import { ResourceEditProvider, ResourceRow, EditResourceButton } from "./ResourceEditing";
import BookingHistory from "./BookingHistory";
import { VALIDITY_WIDTH, rangeInputStyle, tildeStyle, oneLineStyle } from "./styles";
import HolderAvatar from "../overview/HolderAvatar";
import {
  parseResourceFilters,
  hasAnyResourceFilter,
  matchesResourceFilters,
  STATUS_FILTER_OPTIONS,
} from "@/lib/resourceFilter";
import {
  badgeKind,
  formatDateRange,
  formatValidity,
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

// 表单上的有效期 → 能写库的 Period[]。一段一对输入框，几段就几对（lib/validity.ts）
function validityFromForm(formData: FormData) {
  const periods = periodsFromFormData(formData);
  if (periods === "dates") throw new Error("有效期的结束日期不能早于开始日期");
  return periods;
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
    // 有效期两头各自选填，留空 = 这一头不设限（lib/validity.ts）。新建只有一段
    validity: serializeValidity(validityFromForm(formData)),
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/resources");
  revalidatePath("/admin/overview");
}

// 删除 / 恢复 / 编辑后保存在 ./actions.ts（删除是软删除，迁移 0013）

// 筛选行的控件比新增表单里的紧凑：11 列挤在一行。
// boxSizing 不能少——inputStyle 带内边距和边框，默认 content-box 的话 width:100%
// 会比同格的 <select>（浏览器默认 border-box）宽出十几像素，右边对不齐。
/**
 * 排期那一列：「第一单 … 最新一单　N 单」一行，点开浮出全部明细。
 *
 * 原来是所有单子挤在一行横着滚。这一列在 1600 宽的屏上只分到 139px，一单都放不全
 * （一条要 190px 上下），实际只看得到第一条的前半截。
 *
 * **放不下时整段藏掉「第一单」，不把字截成半截。** 靠的是 `row-reverse + wrap`：
 * DOM 里顺序是「N 单 / 最新 / 第一单+连接符」，反向排之后从右往左摆，挤不下的
 * 最后一项（第一单）折到第二行，被固定行高 + overflow:hidden 切掉。
 * 不用 JS、不用猜一个阈值宽度 —— 放得下就显示，放不下就不显示，按真实字宽算。
 * `justify-content: flex-end` 在 row-reverse 里是往**左**贴，所以看着还是左对齐。
 *
 * 浮层用原生 <details>，点外面收起来也是一条 CSS（跟 app/provider/AccountMenu.tsx 的
 * acctCss 同一个做法）：开着的时候给 summary 铺一张看不见的全屏底板，点底板 = 点 summary。
 * 浮层是 summary 的兄弟节点，不在 overflow:hidden 里面，不会被切。
 *
 * 必须走 dangerouslySetInnerHTML：里面有 `>`，写成 <style>{css}</style> 会被 React 转义成
 * `&gt;`，整条选择器失效（CLAUDE.md「往页面里塞 CSS」那条）。
 */
const BOOKING_LINE_HEIGHT = 18;
const bookingCss = `
  .bk { position: relative; }
  .bk > summary { list-style: none; cursor: pointer; }
  .bk > summary::-webkit-details-marker { display: none; }
  .bk-line {
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: baseline;
    column-gap: 4px;
    height: ${BOOKING_LINE_HEIGHT}px;
    line-height: ${BOOKING_LINE_HEIGHT}px;
    overflow: hidden;
    white-space: nowrap;
    font-size: 12px;
  }
  .bk-count { color: var(--text-faint); font-size: 11px; margin-left: 6px; border-bottom: 1px dotted var(--border-strong); line-height: 14px; }
  .bk[open] .bk-count { color: var(--link); }
  .bk[open] > summary::after { content: ""; position: fixed; inset: 0; z-index: 5; cursor: default; }
  .bk-pop {
    position: absolute; left: 0; top: 100%; margin-top: 4px; z-index: 10;
    min-width: 280px; box-sizing: border-box; padding: 6px 10px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--surface); box-shadow: 0 6px 20px rgba(0,0,0,.12);
    font-size: 12px; line-height: 1.9; white-space: nowrap;
  }
  .bk-pop-row { display: grid; grid-template-columns: max-content max-content 1fr max-content; column-gap: 10px; }
`;
const filterInputStyle = {
  ...inputStyle,
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "3px 5px",
  fontSize: 12,
};

export default async function ResourcesAdminPage(
  props: {
    // 逐列筛选走 URL 参数，跟 ?edit= 一个路子：能收藏、能分享、刷新不丢
    searchParams: Promise<{
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
      /** 删除被拦下时带回来（./actions.ts） */
      error?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const [{ data: resources, error }, { data: providers }, { data: assignments }] =
    await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase.from("providers").select(`id, ${personSpread(DISPLAY_COLUMNS)}`),
      supabase
        .from("order_assignments")
        .select(
          // 只要排期那一行的摘要（第一单 … 最新一单 N 单）和单数：客户名只在浮层里用，
          // 浮层点开才去拿（lib/resourceBookings.ts）。带上客户名的话近五千条分配要多 join 一层
          "resource_id, orders(id, location, demand_days)"
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
    return o ? displayName(o, "-") : "-";
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
        // 有好几段时按整个跨度筛（最早开始 ~ 最晚结束）
        rangeStart: validitySpan(resourcePeriods(s)).start,
        rangeEnd: validitySpan(resourcePeriods(s)).end,
        bookingCount: (bookingsByResource.get(s.id) ?? []).length,
        badge: badgeKind(s),
      },
      filters
    )
  );

  return (
    <main>
      <style dangerouslySetInnerHTML={{ __html: bookingCss }} />
      <h1 style={pageTitleStyle}>Resource 管理</h1>
      <p style={helpTextStyle}>
        一个 Provider 可以挂多个人的资源，一个资源挂一行。
      </p>
      {searchParams.error === "booked" && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{DELETE_BLOCKED_TEXT}</p>
      )}

      <form action={createResource} style={formStyle}>
        <select name="provider_id" style={selectStyle} required defaultValue="">
          <option value="" disabled>
            选 Provider *
          </option>
          {providers?.map((o: any) => (
            <option key={o.id} value={o.id}>
              {displayName(o)}
            </option>
          ))}
        </select>
        <select name="item_type" style={selectStyle} defaultValue="alpha">
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
          type="date" max={DATE_INPUT_MAX}
          title="物主生日"
          style={inputStyle}
        />
        <input
          name="date_range_start"
          type="date" max={DATE_INPUT_MAX}
          title="有效期开始（选填，空 = 不设下限）"
          style={inputStyle}
        />
        <input
          name="date_range_end"
          type="date" max={DATE_INPUT_MAX}
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
        <div style={{ ...cellStyle, width: VALIDITY_WIDTH }}>有效期</div>
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
          <div style={{ ...cellStyle, width: VALIDITY_WIDTH, display: "flex", alignItems: "center", gap: 2 }}>
            <input type="date" max={DATE_INPUT_MAX} name="vfrom" defaultValue={filters.validFrom} title="有效期起：不早于这天" style={{ ...filterInputStyle, ...rangeInputStyle }} />
            <span style={tildeStyle}>~</span>
            <input type="date" max={DATE_INPUT_MAX} name="vto" defaultValue={filters.validTo} title="有效期止：不晚于这天" style={{ ...filterInputStyle, ...rangeInputStyle }} />
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
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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

      <ResourceEditProvider
        initialId={editingId ?? null}
        providers={(providers ?? []).map((o: any) => ({ id: o.id, name: displayName(o) }))}
      >
      {visibleResources.map((s: any) => (
        <ResourceRow
          key={s.id}
          resource={{
            id: s.id,
            provider_id: s.provider_id,
            item_type: s.item_type,
            holder_name: s.holder_name,
            holder_gender: s.holder_gender,
            holder_date_of_birth: s.holder_date_of_birth,
            holder_photo_path: s.holder_photo_path ?? null,
            validity: s.validity,
            status: s.status,
          }}
        >
          {/* 删掉的资源整行压暗 —— 右边挂牌状态那一格已经写着「已删除」（statusBadge），
              压暗是让人扫表时一眼略过它 */}
          <div style={s.deleted_at ? { ...rowStyle, color: "var(--text-faint)" } : rowStyle}>
            <div title={providerName(s.provider_id)} style={{ ...cellStyle, ...oneLineStyle, flex: 1.1 }}>{providerName(s.provider_id)}</div>
            <div style={{ ...cellStyle, width: 70 }}>{s.item_type ?? "-"}</div>
            <div title={s.holder_name ?? ""} style={{ ...cellStyle, flex: 1.1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <HolderAvatar path={s.holder_photo_path} name={s.holder_name} />
              <span style={{ ...oneLineStyle, minWidth: 0 }}>{s.holder_name ?? "-"}</span>
            </div>
            <div style={{ ...cellStyle, width: 60 }}>
              {genderLabel(s.holder_gender)}
            </div>
            <div style={{ ...cellStyle, width: 96 }}>
              {s.holder_date_of_birth ?? "-"}
            </div>
            <div style={{ ...cellStyle, width: 70 }}>
              {calcAge(s.holder_date_of_birth) ?? "-"}
            </div>
            {/* 有效期几段都在一行，不叠行 —— 叠了的话两段的资源那一行就比别的高一截，
                整张表高低不齐。新的一段排前面：放不下时截掉的是早就过去的那段 */}
            <div
              title={formatValidity(s)}
              style={{ ...cellStyle, ...oneLineStyle, width: VALIDITY_WIDTH }}
            >
              {resourcePeriods(s)
                .reverse()
                .map((p) => formatDateRange(p.start, p.end))
                .join("、")}
            </div>
            <div style={{ ...cellStyle, flex: 1.8 }}>
              {(() => {
                // 一行只给头尾两单，其余（连同客户名、状态）收进浮层。
                // 还是一行高：一个资源排过七八单也不会把这一行撑高，整张表扫得动
                const { list, first, last, joiner } = summarizeBookings(
                  bookingsByResource.get(s.id) ?? []
                );
                if (!first) {
                  return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>还没排过</span>;
                }
                // 浮层里的全部明细点开才拿（BookingHistory → /admin/resources/bookings）
                return (
                  <BookingHistory resourceId={s.id}>
                      {/* 顺序是反的，见 bookingCss 的注释：从右往左摆，放不下的第一单折走 */}
                      <div className="bk-line">
                        <span className="bk-count">{list.length} 单</span>
                        {/* 每一段都要包一层 span：BookingText 是 fragment，直接放进 flex
                            容器会拆成好几个 flex 项，折行时就不是整段一起走了 */}
                        {last && (
                          <span>
                            <BookingText o={last} />
                          </span>
                        )}
                        <span>
                          <BookingText o={first} />
                          {joiner && (
                            <span style={{ color: "var(--text-faint)" }}>
                              {joiner === "…" ? " … " : joiner}
                            </span>
                          )}
                        </span>
                      </div>
                    </BookingHistory>
                );
              })()}
            </div>
            <div style={{ ...cellStyle, width: 110, color: statusBadge(s).color }}>
              {statusBadge(s).text}
            </div>
            <div style={{ ...cellStyle, width: 110, display: "flex", gap: 10 }}>
              {s.deleted_at ? (
                // 删掉的资源只给「恢复」：要改就先恢复，别在一张「不存在」的资源上改来改去
                <form action={restoreResource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" style={linkButtonStyle}>
                    恢复
                  </button>
                </form>
              ) : (
                <>
                  {/* 当场切成编辑态，不跳页（ResourceEditing.tsx） */}
                  <EditResourceButton id={s.id} />
                  {/* 已经排出去的资源不给删（lib/resourceEdit.ts 的 deleteBlockReason），
                      按钮直接不出现；服务端那边另有一道拦 */}
                  {(bookingsByResource.get(s.id) ?? []).length === 0 && (
                    <form action={deleteResource}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" style={dangerLinkStyle}>
                        删除
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </ResourceRow>
      ))}
      </ResourceEditProvider>
    </main>
  );
}

// 排期那一行里的一单：「9/19-20 locbl」。日期蓝色，跟原来一致
function BookingText({ o }: { o: any }) {
  return (
    <>
      <span style={{ color: "var(--link)" }}>{formatDayRanges(o.demand_days ?? [])}</span>{" "}
      {o.location ?? "?"}
    </>
  );
}
