import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { calcAge } from "@/lib/age";
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
  const firstName = (formData.get("first_name") as string)?.trim();
  const phone = (formData.get("phone_number") as string)?.trim();
  if (!firstName || !phone) throw new Error("姓名和电话必填");

  const { error } = await supabase.from("providers").insert({
    first_name: firstName,
    last_name: (formData.get("last_name") as string)?.trim() || null,
    phone_number: phone,
    chat: (formData.get("chat") as string)?.trim() || null,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    note: (formData.get("note") as string)?.trim() || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/providers");
  revalidatePath("/admin/overview");
}

async function updateProvider(formData: FormData) {
  "use server";
  const { error } = await supabase
    .from("providers")
    .update({
      first_name: (formData.get("first_name") as string)?.trim() || null,
      last_name: (formData.get("last_name") as string)?.trim() || null,
      phone_number: (formData.get("phone_number") as string)?.trim() || null,
      chat: (formData.get("chat") as string)?.trim() || null,
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      status: formData.get("status") as string,
      note: (formData.get("note") as string)?.trim() || null,
    })
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/providers");
  revalidatePath("/admin/overview");
  redirect("/admin/providers"); // 存完退出编辑状态
}

async function deleteProvider(formData: FormData) {
  "use server";
  const { error } = await supabase
    .from("providers")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) throw new Error(error.message);
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
    .select("*")
    .order("created_at", { ascending: false });

  const editingId = searchParams.edit;

  return (
    <main>
      <h1 style={pageTitleStyle}>Provider 管理</h1>
      <p style={helpTextStyle}>
        删除会连带删掉这个 Provider 名下的所有 Resource。
      </p>

      <form action={createProvider} style={formStyle}>
        <input name="first_name" placeholder="First name *" required style={inputStyle} />
        <input name="last_name" placeholder="Last name" style={inputStyle} />
        <input name="phone_number" placeholder="Phone *" required style={inputStyle} />
        <input name="chat" placeholder="Chat" style={inputStyle} />
        <input name="date_of_birth" type="date" title="生日" style={inputStyle} />
        <input name="note" placeholder="Note" style={inputStyle} />
        <button type="submit" style={buttonStyle}>
          新增 Provider
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error.message}</p>}

      <div style={headerRowStyle}>
        <div style={{ ...cellStyle, flex: 1.4 }}>姓名</div>
        <div style={{ ...cellStyle, flex: 1.2 }}>电话</div>
        <div style={{ ...cellStyle, flex: 1 }}>聊天</div>
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
            <div style={{ ...cellStyle, flex: 1.4, display: "flex", gap: 4 }}>
              <input
                name="first_name"
                defaultValue={o.first_name ?? ""}
                placeholder="First"
                style={{ ...inputStyle, width: "50%" }}
              />
              <input
                name="last_name"
                defaultValue={o.last_name ?? ""}
                placeholder="Last"
                style={{ ...inputStyle, width: "50%" }}
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
                name="chat"
                defaultValue={o.chat ?? ""}
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
            <div style={{ ...cellStyle, flex: 1.4 }}>
              {o.first_name} {o.last_name}
            </div>
            <div style={{ ...cellStyle, flex: 1.2 }}>{o.phone_number ?? "-"}</div>
            <div style={{ ...cellStyle, flex: 1 }}>{o.chat ?? "-"}</div>
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
