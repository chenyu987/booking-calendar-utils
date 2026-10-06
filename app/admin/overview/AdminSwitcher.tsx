"use client";

import { useRouter } from "next/navigation";
import { ADMIN_COOKIE, type Admin } from "@/lib/admins";

// 排期总览标题旁边那个「当前身份」。切到谁，新建的单子就记成谁的客人
// （= 这个客人是哪个账号加的，以后找人知道用谁的号）。
//
// 存 cookie，**每台电脑各记各的**（见 lib/admins.ts 的 ADMIN_COOKIE）。
// 不是登录 —— 谁都能切；等接了 admin 登录，身份就该从登录账号来，这个下拉退场。
//
// 切完 router.refresh()：建单弹窗里「记到谁名下」那句、没选身份时灰掉的「创建」，
// 都是服务端按 cookie 画的
export default function AdminSwitcher({ admins, currentId }: { admins: Admin[]; currentId: string | null }) {
  const router = useRouter();
  const unset = !currentId;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: unset ? "var(--warn)" : "var(--text-muted)",
      }}
      title="切到谁，新建的单子就记成谁的客人。每台电脑各记各的"
    >
      当前身份
      <select
        value={currentId ?? ""}
        onChange={(e) => {
          document.cookie = `${ADMIN_COOKIE}=${e.target.value}; path=/; max-age=31536000`;
          router.refresh();
        }}
        style={{
          padding: "3px 6px",
          fontSize: 13,
          borderRadius: 4,
          border: `1px solid ${unset ? "var(--warn)" : "var(--border-strong)"}`,
        }}
      >
        {unset && (
          <option value="" disabled>
            先选你是谁
          </option>
        )}
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
