import Link from "next/link";
import MobileScroll from "@/app/admin/MobileScroll";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { PERSON_COLUMNS, personSpread } from "@/lib/people";
import { ADDRESS_COLUMNS, formatAddress } from "@/lib/address";
import AddressFields from "@/app/AddressFields";
import { calcAge } from "@/lib/age";
import { DATE_INPUT_MAX } from "@/lib/dates";
import { selfName } from "@/lib/person";
import { claimSuggestions } from "@/lib/selfClaim";
import { CONTACT_FILTER_NONE, resolvePrimaryAdmin } from "@/lib/admins";
import { loadAdmins, loadPersonContacts } from "@/lib/personContacts";
import { getPrimaryAdminId } from "@/lib/appSettings";
import {
  PROVIDER_STATUSES,
  hasAnyProviderFilter,
  matchesProviderFilters,
  providerFiltersQuery,
  parseProviderFilters,
} from "@/lib/providerFilter";
import FilterForm from "@/app/admin/orders/FilterForm";
import { ContactCheckboxes, ContactTags } from "@/app/admin/customers/CustomerTable";
import { createProvider, mergeProvider, updateProvider } from "./actions";
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

// 删的是**物主这个身份**（providers 那一行，连带他名下的资源），不是这个人。
// 他要是也是客户，人和客户那边的订单都留着；不是的话，人也一起删掉 ——
// 留一个什么身份都没有的人，哪张列表上都看不见，只会在下次按邮箱认领时冒出来
async function deleteProvider(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const { error } = await supabase.from("providers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  // 查不到 ≠ 不是客户。查询出错时当成「不是」的话，下面删人会顺着外键把他的
  // 客户身份和订单一起 cascade 掉 —— 出错就停，宁可留一个空身份的人
  const { data: asCustomer, error: lookupError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!asCustomer) {
    const { error: personError } = await supabase.from("people").delete().eq("id", id);
    if (personError) throw new Error(personError.message);
  }
  revalidatePath("/admin/providers");
  revalidatePath("/admin/overview");
}

export default async function ProvidersAdminPage(
  props: {
    // 逐列筛选走 URL 参数（lib/providerFilter.ts），跟 ?edit= 一个路子：能收藏、能分享、刷新不丢
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  // 资源数只给「可能是老物主」那块用（合之前看一眼两边各挂了几张）。全部并行发。
  // 管理员 / 归属两条查询出错会直接抛 —— 当成「都没标」的话，编辑一下就会把原来的全删掉
  const [{ data: providers, error }, { data: resources }, admins, contactsByPerson, rawPrimaryId] = await Promise.all([
    supabase
      .from("providers")
      // 地址（0028）不在 PERSON_COLUMNS 里（那个每次查人都带），这一页要用就点名带上
      .select(`*, ${personSpread(`${PERSON_COLUMNS}, ${ADDRESS_COLUMNS}` as const)}`)
      .order("created_at", { ascending: false }),
    supabase.from("resources").select("provider_id").is("deleted_at", null),
    loadAdmins(),
    loadPersonContacts(),
    getPrimaryAdminId(),
  ]);
  // 「谁的客人」标签：非主要管理员按 adminTagColors 上色（Admin1 = 浅玫红），主要管理员照旧
  const primaryId = resolvePrimaryAdmin(rawPrimaryId, admins);
  const contactsOf = (id: string) => contactsByPerson.get(id) ?? [];
  // 逐列筛选。年龄从生日现算、地址拼成一行，所以在内存里筛（一两百个物主，不心疼）
  const filters = parseProviderFilters(searchParams, admins);
  const filtering = hasAnyProviderFilter(filters);
  const query = providerFiltersQuery(filters);
  // 正在编辑的那一行不筛掉：改完它可能就不符合筛选了，编辑到一半行没了更糟
  const shown = (providers ?? []).filter(
    (o) =>
      o.id === searchParams.edit ||
      matchesProviderFilters(
        {
          chatName: o.chat_name,
          selfName: selfName(o),
          phone: o.phone_number,
          chatId: o.chat_id,
          age: calcAge(o.date_of_birth),
          status: o.status,
          contactIds: contactsOf(o.id),
          address: formatAddress(o),
          note: o.note,
        },
        filters
      )
  );
  const cardCount = new Map<string, number>();
  for (const s of resources ?? []) cardCount.set(s.provider_id, (cardCount.get(s.provider_id) ?? 0) + 1);

  // 自己登录进来、填的昵称对得上一个老物主的（lib/selfClaim.ts，跟 Customer 管理同一份）。
  // 认领只按邮箱，老物主几乎只有昵称，第一次登录落到的是个新建的空人。只提示，管理员点了才合
  const suggestions = claimSuggestions(providers ?? []);

  const editingId = searchParams.edit;

  return (
    <main>
      <h1 style={pageTitleStyle}>Provider 管理</h1>
      <p style={helpTextStyle}>
        删除会连带删掉这个 Provider 名下的所有 Resource。这个人如果也是客户，他的资料和订单都还在。
      </p>

      <form action={createProvider} style={formStyle}>
        <input name="chat_name" placeholder="昵称 *" required style={inputStyle} />
        <input name="chat_id" placeholder="账号 *" required style={inputStyle} />
        <input name="phone_number" placeholder="Phone" style={inputStyle} />
        <input name="date_of_birth" type="date" max={DATE_INPUT_MAX} title="生日" style={inputStyle} />
        {/* 地址六个框一行排不下，又是选填 —— 收成一个「地址 ▾」，点开浮一张小面板填。
            原生 <details>，不用客户端组件；收起来时里面的框照样在表单里，填了的照样提交 */}
        <details className="addr-pop" style={{ position: "relative" }}>
          <summary style={addrSummaryStyle}>地址 ▾</summary>
          <div style={addrPanelStyle}>
            <AddressFields value={null} inputStyle={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} labelStyle={addrLabelStyle} layout="stack" />
          </div>
        </details>
        <input name="note" placeholder="Note" style={inputStyle} />
        <ContactCheckboxes admins={admins} checked={[]} />
        <button type="submit" style={buttonStyle}>
          新增 Provider
        </button>
      </form>
      {/* 点面板外面收起来：跟物主账号菜单（app/provider/AccountMenu.tsx 的 acctCss）同一招，
          开着时给 summary 铺一张看不见的全屏底板，点它 = 点 summary。面板 z-index 更高，点里面照常 */}
      <style dangerouslySetInnerHTML={{ __html: addrPopCss }} />

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      {searchParams.merge_error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{searchParams.merge_error}</p>
      )}
      {suggestions.length > 0 && (
        <section style={claimCardStyle}>
          <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>可能是老物主（{suggestions.length}）</h2>
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 8px" }}>
            这些人自己用邮箱登录、新建了账号，填的昵称 / 账号跟一个老物主对上了。确认是同一个人再合并：
            登录账号挂到老物主身上，新账号下的资源一起挪过去，老物主原有的资料不动。
            随便谁都能填别人的昵称，所以不自动合。
          </p>
          {suggestions.map(({ me, old }) => (
            <form
              key={me.id}
              action={mergeProvider}
              style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13, padding: "4px 0" }}
            >
              <input type="hidden" name="drop" value={me.id} />
              <input type="hidden" name="keep" value={old.id} />
              <span>
                {me.email ?? "（没有邮箱）"} 填的「{me.chat_name || me.chat_id}」
                {cardCount.get(me.id) ? `（新账号下 ${cardCount.get(me.id)} 个资源）` : ""}
              </span>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <span>
                老物主 <strong>{old.chat_name || old.chat_id}</strong>
                {old.phone_number ? ` · ${old.phone_number}` : ""}
                {` · ${cardCount.get(old.id) ?? 0} 个资源`}
              </span>
              <button type="submit" style={{ ...buttonStyle, padding: "2px 10px", fontSize: 12 }}>
                是同一个人，合并
              </button>
            </form>
          ))}
        </section>
      )}

      <MobileScroll minWidth={1100}>
      <div style={headerRowStyle}>
        <div style={COL.name}>昵称</div>
        <div style={COL.phone}>电话</div>
        <div style={COL.chat}>账号</div>
        <div style={COL.dob}>生日</div>
        <div style={COL.age}>年龄</div>
        <div style={COL.status}>状态</div>
        <div style={COL.contact}>谁的客人</div>
        <div style={COL.address}>地址</div>
        <div style={COL.note}>备注</div>
        <div style={COL.ops}>操作</div>
      </div>

      {/* 逐列筛选长在表头底下（app/admin/orders/FilterForm.tsx，改了就自动筛，空值不拼进 URL）。
          文字框失焦或回车时筛；规则在 lib/providerFilter.ts */}
      <FilterForm action="/admin/providers">
        <div style={{ ...rowStyle, background: "var(--surface-2)" }}>
          <div style={COL.name}>
            <input name="name" defaultValue={filters.name} placeholder="昵称 / 称呼" style={filterInputStyle} />
          </div>
          <div style={COL.phone}>
            <input name="phone" defaultValue={filters.phone} placeholder="电话" style={filterInputStyle} />
          </div>
          <div style={COL.chat}>
            <input name="chat" defaultValue={filters.chat} placeholder="账号" style={filterInputStyle} />
          </div>
          {/* 生日这一格不放控件：年龄就是从生日算出来的，两个都给反而让人纠结用哪个（跟 Resource 管理一样） */}
          <div style={{ ...COL.dob, color: "var(--text-faint)", fontSize: 11 }}>按年龄筛 →</div>
          <div style={{ ...COL.age, display: "flex", alignItems: "center", gap: 2 }}>
            <input
              name="agemin"
              inputMode="numeric"
              defaultValue={filters.ageMin}
              title="最小年龄"
              placeholder="小"
              style={{ ...filterInputStyle, flex: 1, minWidth: 0, padding: "3px 2px" }}
            />
            <span style={{ color: "var(--text-faint)", flexShrink: 0, fontSize: 11 }}>~</span>
            <input
              name="agemax"
              inputMode="numeric"
              defaultValue={filters.ageMax}
              title="最大年龄"
              placeholder="大"
              style={{ ...filterInputStyle, flex: 1, minWidth: 0, padding: "3px 2px" }}
            />
          </div>
          <div style={COL.status}>
            <select name="status" defaultValue={filters.status} style={filterInputStyle}>
              <option value="">全部</option>
              {PROVIDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div style={COL.contact}>
            <select name="contact" defaultValue={filters.contact} style={filterInputStyle}>
              <option value="">全部</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={CONTACT_FILTER_NONE}>还没标</option>
            </select>
          </div>
          <div style={COL.address}>
            <input name="address" defaultValue={filters.address} placeholder="地址" style={filterInputStyle} />
          </div>
          <div style={COL.note}>
            <input name="note" defaultValue={filters.note} placeholder="备注" style={filterInputStyle} />
          </div>
          <div style={{ ...COL.ops, fontSize: 11, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            {filtering ? (
              <>
                <span style={{ color: "var(--warn)" }}>
                  {shown.length} / {providers?.length ?? 0} 人
                </span>
                <Link href="/admin/providers" style={linkButtonStyle}>
                  清除
                </Link>
              </>
            ) : (
              "填完自动筛"
            )}
          </div>
        </div>
      </FilterForm>

      {filtering && shown.length === 0 && (
        <p style={{ ...helpTextStyle, padding: "12px 0" }}>
          共 {providers?.length ?? 0} 个物主，没有符合条件的——放宽一点试试
        </p>
      )}

      {shown.map((o) =>
        o.id === editingId ? (
          // flexWrap：第一行跟普通态一列一列对齐，地址太长塞不进一格，单独折到第二行
          <form key={o.id} action={updateProvider} style={{ ...rowStyle, flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={o.id} />
            {/* 存完回到筛过的列表（providerReturnPath 会重新解析一遍，不原样用） */}
            <input type="hidden" name="back" value={query} />
            <div style={COL.name}>
              <input
                name="chat_name"
                defaultValue={o.chat_name ?? ""}
                placeholder="昵称 *"
                required
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={COL.phone}>
              <input
                name="phone_number"
                defaultValue={o.phone_number ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={COL.chat}>
              <input
                name="chat_id"
                defaultValue={o.chat_id ?? ""}
                placeholder="账号"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={COL.dob}>
              <input
                name="date_of_birth"
                type="date" max={DATE_INPUT_MAX}
                defaultValue={o.date_of_birth ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...COL.age, color: "var(--text-faint)" }}>自动</div>
            <div style={COL.status}>
              <select
                name="status"
                defaultValue={o.status}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="blacklisted">blacklisted</option>
              </select>
            </div>
            <div style={COL.contact}>
              <ContactCheckboxes admins={admins} checked={contactsOf(o.id)} />
            </div>
            <div style={{ ...COL.address, color: "var(--text-faint)" }}>↓ 下面一行</div>
            <div style={COL.note}>
              <input
                name="note"
                defaultValue={o.note ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...COL.ops, display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href={`/admin/providers${query}`} style={linkButtonStyle}>
                取消
              </Link>
            </div>
            <div style={{ flexBasis: "100%", minWidth: 0, display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...cellStyle, color: "var(--text-muted)", flexShrink: 0 }}>地址</span>
              <AddressFields value={o} inputStyle={inputStyle} layout="row" />
            </div>
          </form>
        ) : (
          <div key={o.id} style={rowStyle}>
            <div style={COL.name}>
              {o.chat_name || "-"}
              {/* 自己注册时填的称呼：别处显示的是它（称呼优先），这里也得看得到 */}
              {selfName(o) && selfName(o) !== o.chat_name && (
                <span style={{ color: "var(--text-faint)", fontSize: 12 }}> · 称呼 {selfName(o)}</span>
              )}
            </div>
            <div style={COL.phone}>{o.phone_number ?? "-"}</div>
            <div style={COL.chat}>{o.chat_id ?? "-"}</div>
            <div style={COL.dob}>{o.date_of_birth ?? "-"}</div>
            <div style={COL.age}>{calcAge(o.date_of_birth) ?? "-"}</div>
            <div style={COL.status}>{o.status}</div>
            <div style={COL.contact}>
              <ContactTags ids={contactsOf(o.id)} admins={admins} primaryId={primaryId} />
            </div>
            <div
              style={{ ...COL.address, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={formatAddress(o) ?? undefined}
            >
              {formatAddress(o) ?? "-"}
            </div>
            <div style={COL.note}>{o.note ?? "-"}</div>
            <div style={{ ...COL.ops, display: "flex", gap: 10 }}>
              <Link href={`/admin/providers${providerFiltersQuery(filters, { edit: o.id })}`} style={linkButtonStyle}>
                编辑
              </Link>
              <form action={deleteProvider}>
                <input type="hidden" name="id" value={o.id} />
                <button type="submit" style={dangerLinkStyle}>
                  删除
                </button>
              </form>
            </div>
          </div>
        )
      )}
      </MobileScroll>
    </main>
  );
}

// 列宽只许有一份：表头 / 筛选行 / 编辑行 / 普通行四处都从这儿取（CLAUDE.md「逐列筛选」那条）
const COL = {
  name: { ...cellStyle, flex: 1.4 },
  phone: { ...cellStyle, flex: 1.2 },
  chat: { ...cellStyle, flex: 1 },
  dob: { ...cellStyle, width: 120 },
  // 70：筛选行这一格要放「最小 ~ 最大」两个框（跟 Resource 管理一样宽）
  age: { ...cellStyle, width: 70 },
  status: { ...cellStyle, width: 100 },
  contact: { ...cellStyle, width: 120 },
  address: { ...cellStyle, flex: 1.6 },
  note: { ...cellStyle, flex: 1 },
  ops: { ...cellStyle, width: 120 },
} satisfies Record<string, React.CSSProperties>;

const filterInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  boxSizing: "border-box",
  padding: "3px 5px",
};

const addrPopCss = `
  .addr-pop > summary { list-style: none; }
  .addr-pop > summary::-webkit-details-marker { display: none; }
  .addr-pop[open] > summary::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 5;
    cursor: default;
  }
`;
// 长得跟旁边的输入框一样（同一个 inputStyle），只是字是占位色
const addrSummaryStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  color: "var(--text-muted)",
  userSelect: "none",
};
const addrPanelStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: "100%",
  marginTop: 4,
  zIndex: 10,
  width: 260,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--surface)",
  boxShadow: "0 6px 20px rgba(0,0,0,.12)",
};
const addrLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 12,
  color: "var(--text-muted)",
};

const claimCardStyle: React.CSSProperties = {
  border: "1px solid var(--warn)",
  borderRadius: 6,
  padding: "10px 12px",
  margin: "12px 0",
};
