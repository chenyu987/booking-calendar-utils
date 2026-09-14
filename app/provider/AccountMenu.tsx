import Link from "next/link";
import { saveContact } from "./actions";
import ThemeToggle from "./ThemeToggle";
import type { Theme } from "@/lib/theme";

// 右上角的账号菜单。**联系方式从主体挪进来了** —— 它是账号设置，不是物主每次
// 进来要看的东西，跟「有哪些需求」抢同一层视觉重量纯属浪费。
//
// 同样用原生 <details>：点外面不会自动收起（那需要 JS），但这个面板里没有
// 破坏性操作，开着也不碍事，不值得为它引一个客户端组件。
//
// 两种情况下默认展开：正在编辑联系方式、或者聊天还没填（那是要办的事）。
export default function AccountMenu({
  email,
  me,
  theme,
  editing,
  errorText,
}: {
  email: string;
  me: any;
  theme: Theme | null;
  editing: boolean;
  errorText: string | null;
}) {
  const noChat = !me?.chat;

  return (
    <details className="disc acct" open={editing || noChat} style={{ position: "relative" }}>
      <summary style={summaryInline}>
        <span style={{ fontSize: 13 }}>{me?.first_name || "账号"}</span>
        {noChat && <span style={{ color: "var(--warn)", fontSize: 13 }}>●</span>}
      </summary>

      <div style={panelStyle}>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 8px", wordBreak: "break-all" }}>
          {email}
        </p>

        {errorText && (
          <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 8px", lineHeight: 1.6 }}>
            {errorText}
          </p>
        )}

        {editing ? (
          <form action={saveContact} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={labelStyle}>
              称呼
              <input name="first_name" defaultValue={me?.first_name ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              账号 *
              <input name="chat" required defaultValue={me?.chat ?? ""} style={inputStyle} />
            </label>
            <p style={{ fontSize: 11, color: "var(--warn)", margin: 0, lineHeight: 1.6 }}>
              重要：有人要租你的资源，我们是通过聊天联系你的。
            </p>
            <label style={labelStyle}>
              手机号
              <input
                name="phone_number"
                type="tel"
                defaultValue={me?.phone_number ?? ""}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" style={buttonStyle}>
                保存
              </button>
              <Link href="/provider" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                取消
              </Link>
            </div>
          </form>
        ) : (
          <>
            <dl style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.9 }}>
              <Row label="账号" value={me?.chat} warn={noChat} />
              <Row label="手机号" value={me?.phone_number} />
            </dl>
            {noChat && (
              <p style={{ fontSize: 11, color: "var(--warn)", margin: "6px 0 0", lineHeight: 1.6 }}>
                账号还没填 —— 有人要租你的资源，我们是通过聊天找你的。
              </p>
            )}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>外观</div>
              <ThemeToggle initial={theme} />
            </div>

            <div style={footerStyle}>
              <Link href="/provider?edit=contact" style={{ fontSize: 12, color: "var(--link)" }}>
                改联系方式
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" style={signOutStyle}>
                  退出
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function Row({ label, value, warn }: { label: string; value?: string | null; warn?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ color: "var(--text-faint)", width: 44, flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0, color: warn ? "var(--warn)" : undefined }}>
        {value || <span style={{ color: "var(--text-faint)" }}>未填</span>}
      </dd>
    </div>
  );
}

const summaryInline: React.CSSProperties = {
  border: "1px solid var(--border-strong)",
  borderRadius: 999,
  padding: "4px 12px",
};
const panelStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "100%",
  marginTop: 6,
  zIndex: 10,
  width: "min(272px, calc(100vw - 48px))",
  boxSizing: "border-box",
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  boxShadow: "0 6px 20px rgba(0,0,0,.12)",
};
const footerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--border)",
};
const inputStyle: React.CSSProperties = {
  padding: 6,
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 12,
  color: "var(--text-muted)",
};
const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "none",
  background: "var(--solid-bg)",
  color: "var(--on-solid)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const signOutStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  padding: "3px 10px",
  fontSize: 12,
  color: "var(--text-muted)",
  cursor: "pointer",
};
