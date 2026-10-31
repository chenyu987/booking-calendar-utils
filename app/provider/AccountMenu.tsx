import Link from "next/link";
import { saveContact } from "./actions";
import ThemeToggle from "./ThemeToggle";
import ViewSettings from "./ViewSettings";
import type { Theme } from "@/lib/theme";
import { selfDisplayName } from "@/lib/person";
import { formatAddress } from "@/lib/address";
import AddressFields from "@/app/AddressFields";
import { chatGap } from "@/lib/selfClaim";

// 右上角的账号菜单。**联系方式从主体挪进来了** —— 它是账号设置，不是物主每次
// 进来要看的东西，跟「有哪些需求」抢同一层视觉重量纯属浪费。
//
// 同样用原生 <details>，**点外面收起来也不用 JS**：见下面 acctCss 那段。
//
// 两种情况下默认展开：正在编辑联系方式、或者聊天还没填（那是要办的事）。

/**
 * 点菜单外面任何地方都收起来 —— **一条 CSS，不用客户端组件**。
 *
 * 菜单开着的时候，给 summary 铺一张看不见的全屏底板（`::after` + `position: fixed`）。
 * 点到底板上 = 点到 summary 上（伪元素的事件目标就是宿主元素），原生 <details>
 * 收起来。面板 z-index 10 比底板高，所以点面板里的东西照常有效。
 *
 * 为什么不写个 `useEffect` 挂 document 上的 click：那要引一个客户端组件进来，
 * 还得自己负责卸载时摘监听（CLAUDE.md 那条「命令式改了 DOM 就得自己负责撤」）。
 * 这条规则跟节点的生死无关，天然不用清理 —— 跟 BulkSelect 注入 CSS 是同一个路子。
 */
export const acctCss = `
  .acct[open] > summary::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 5;
    cursor: default;
  }
`;
export default function AccountMenu({
  email,
  me,
  theme,
  view,
  editing,
  errorText,
}: {
  email: string;
  me: any;
  theme: Theme | null;
  /** 日历怎么排。**收在这儿**：一年调一次的东西，不值得在正文里占一行 */
  view: { bandDays: number; start: string; from: string; to: string };
  editing: boolean;
  errorText: string | null;
}) {
  // 昵称 + 账号缺哪样（跟客户同一份判断）；齐了是 null
  const gap = chatGap(me);
  const noChat = gap !== null;

  return (
    <details className="disc acct" open={editing || noChat} style={{ position: "relative" }}>
      <summary style={summaryInline}>
        <span style={{ fontSize: 13 }}>{selfDisplayName(me, "账号")}</span>
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
              昵称 *
              <input
                name="chat_name"
                required
                defaultValue={me?.chat_name ?? ""}
                placeholder="聊天里显示的名字"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              账号 *
              <input
                name="chat_id"
                required
                defaultValue={me?.chat_id ?? ""}
                placeholder="聊天 → 我，名字下面那串"
                style={inputStyle}
              />
            </label>
            <p style={{ fontSize: 11, color: "var(--warn)", margin: 0, lineHeight: 1.6 }}>
              重要：有人要租你的资源，我们是通过聊天联系你的。以前在我们这儿挂过资源的，也靠昵称对上原来的记录。
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
            <AddressFields value={me} inputStyle={inputStyle} labelStyle={labelStyle} layout="stack" />
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
              <Row label="昵称" value={me?.chat_name} warn={!me?.chat_name?.trim()} />
              <Row label="账号" value={me?.chat_id} warn={!me?.chat_id?.trim()} />
              <Row label="手机号" value={me?.phone_number} />
              <Row label="地址" value={formatAddress(me)} />
            </dl>
            {/* 「改联系方式」挨着它要改的那两行 —— 原来在最底下跟「退出」并排，
                离得远不说，还容易看成一类东西（一个是改资料，一个是走人） */}
            <div style={{ marginTop: 6 }}>
              <Link href="/provider?edit=contact" style={{ fontSize: 12, color: "var(--link)" }}>
                改联系方式
              </Link>
            </div>
            {noChat && (
              <p style={{ fontSize: 11, color: "var(--warn)", margin: "6px 0 0", lineHeight: 1.6 }}>
                {gap}还没填 —— 有人要租你的资源，我们是通过聊天找你的。
              </p>
            )}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>日历</div>
              <ViewSettings
                bandDays={view.bandDays}
                start={view.start}
                from={view.from}
                to={view.to}
              />
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>外观</div>
              <ThemeToggle initial={theme} />
            </div>

            <div style={footerStyle}>
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
  justifyContent: "flex-end",
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
