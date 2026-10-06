import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createPerson, PERSON_SPREAD } from "@/lib/people";
import { calcAge } from "@/lib/age";
import { displayName } from "@/lib/person";
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

async function createProvider(formData: FormData) {
  "use server";
  // 昵称必填（认人、显示都靠它）；称呼（first_name）留给以后注册的用户自己填（0020）
  const chatName = (formData.get("chat_name") as string)?.trim();
  const phone = (formData.get("phone_number") as string)?.trim();
  if (!chatName || !phone) throw new Error("昵称和电话必填");

  await createPerson("provider", {
    chat_name: chatName,
    chat_id: (formData.get("chat_id") as string)?.trim() || null,
    phone_number: phone,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
  });
  revalidatePath("/admin/providers");
  revalidatePath("/admin/overview");
}

async function updateProvider(formData: FormData) {
  "use server";
  // 编辑的全是人身上的字段（people，0017）—— 这个人要是也是客户，Customer 管理那边跟着变。
  // 不碰称呼（first/last name）：那是注册用户自己填的，后台不改（0020）
  const chatName = (formData.get("chat_name") as string)?.trim();
  if (!chatName) throw new Error("昵称必填");
  const { error } = await supabase
    .from("people")
    .update({
      chat_name: chatName,
      chat_id: (formData.get("chat_id") as string)?.trim() || null,
      phone_number: (formData.get("phone_number") as string)?.trim() || null,
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      status: formData.get("status") as string,
      note: (formData.get("note") as string)?.trim() || null,
    })
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/providers");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/overview");
  redirect("/admin/providers"); // 存完退出编辑状态
}

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

export default async function ProvidersAdminPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const { data: providers, error } = await supabase
    .from("providers")
    .select(`*, ${PERSON_SPREAD}`)
    .order("created_at", { ascending: false });

  const editingId = searchParams.edit;

  return (
    <main>
      <h1 style={pageTitleStyle}>Provider 管理</h1>
      <p style={helpTextStyle}>
        删除会连带删掉这个 Provider 名下的所有 Resource。这个人如果也是客户，他的资料和订单都还在。
      </p>

      <form action={createProvider} style={formStyle}>
        <input name="chat_name" placeholder="昵称 *" required style={inputStyle} />
        <input name="chat_id" placeholder="账号" style={inputStyle} />
        <input name="phone_number" placeholder="Phone *" required style={inputStyle} />
        <input name="date_of_birth" type="date" title="生日" style={inputStyle} />
        <input name="note" placeholder="Note" style={inputStyle} />
        <button type="submit" style={buttonStyle}>
          新增 Provider
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, flex: 1.4 }}>昵称</div>
        <div style={{ ...cellStyle, flex: 1.2 }}>电话</div>
        <div style={{ ...cellStyle, flex: 1 }}>账号</div>
        <div style={{ ...cellStyle, width: 120 }}>生日</div>
        <div style={{ ...cellStyle, width: 50 }}>年龄</div>
        <div style={{ ...cellStyle, width: 100 }}>状态</div>
        <div style={{ ...cellStyle, flex: 1 }}>备注</div>
        <div style={{ ...cellStyle, width: 120 }}>操作</div>
      </div>

      {providers?.map((o) =>
        o.id === editingId ? (
          <form key={o.id} action={updateProvider} style={rowStyle}>
            <input type="hidden" name="id" value={o.id} />
            <div style={{ ...cellStyle, flex: 1.4 }}>
              <input
                name="chat_name"
                defaultValue={o.chat_name ?? ""}
                placeholder="昵称 *"
                required
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1.2 }}>
              <input
                name="phone_number"
                defaultValue={o.phone_number ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, flex: 1 }}>
              <input
                name="chat_id"
                defaultValue={o.chat_id ?? ""}
                placeholder="账号"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 120 }}>
              <input
                name="date_of_birth"
                type="date"
                defaultValue={o.date_of_birth ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 50, color: "var(--text-faint)" }}>自动</div>
            <div style={{ ...cellStyle, width: 100 }}>
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
            <div style={{ ...cellStyle, flex: 1 }}>
              <input
                name="note"
                defaultValue={o.note ?? ""}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ ...cellStyle, width: 120, display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/admin/providers" style={linkButtonStyle}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <div key={o.id} style={rowStyle}>
            <div style={{ ...cellStyle, flex: 1.4 }}>{displayName(o, "-")}</div>
            <div style={{ ...cellStyle, flex: 1.2 }}>{o.phone_number ?? "-"}</div>
            <div style={{ ...cellStyle, flex: 1 }}>{o.chat_id ?? "-"}</div>
            <div style={{ ...cellStyle, width: 120 }}>{o.date_of_birth ?? "-"}</div>
            <div style={{ ...cellStyle, width: 50 }}>
              {calcAge(o.date_of_birth) ?? "-"}
            </div>
            <div style={{ ...cellStyle, width: 100 }}>{o.status}</div>
            <div style={{ ...cellStyle, flex: 1 }}>{o.note ?? "-"}</div>
            <div style={{ ...cellStyle, width: 120, display: "flex", gap: 10 }}>
              <Link href={`/admin/providers?edit=${o.id}`} style={linkButtonStyle}>
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
    </main>
  );
}
