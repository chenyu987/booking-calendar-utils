"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SettingsDialog, { type Settings } from "./SettingsDialog";
import type { Theme } from "@/lib/theme";

// 侧边栏里的「设置」。用按钮不用 Link：设置是弹框不是页面。
//
// **当前值在页面挂载时就在后台拉好了**，不是点开才拉。点开才拉的话框会分两段
// 出现（先一个空壳再蹦出内容），难看。放在挂载时拉是因为它完全不挡路：页面
// 早就画完了，这一条小请求在后台跑，等人把鼠标移到侧边栏点下去，早回来了。
//
// 万一真没回来（网慢），点击会等这一下再开，而不是先开一个空框 ——
// 宁可晚开半拍，也不要开了之后内容再跳出来。
export default function SettingsTrigger({ theme }: { theme: Theme | null }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // portal 要等挂载：服务端没有 document
  const [mounted, setMounted] = useState(false);
  const inflight = useRef<Promise<Settings> | null>(null);

  const load = useCallback(() => {
    if (!inflight.current) {
      inflight.current = fetch("/admin/settings")
        .then((r) => r.json())
        .catch((e) => {
          inflight.current = null; // 失败了允许再试
          throw e;
        });
    }
    return inflight.current;
  }, []);

  useEffect(() => {
    setMounted(true);
    load()
      .then(setData)
      .catch(() => {
        /* 静默：这只是预取，真点开时还会再试一次并给提示 */
      });
  }, [load]);

  async function openDialog() {
    if (data) return setOpen(true);
    setPending(true);
    setError("");
    try {
      setData(await load());
      setOpen(true);
    } catch {
      setError("读不到设置");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={pending}
        style={{
          border: "none",
          background: "transparent",
          color: error ? "var(--danger)" : "var(--text)",
          // 跟上面几个导航项对齐：字号写死 14，字体族继承 body。
          // 别用 `font: inherit` 简写 —— 它会把 fontSize 一起重置回 body 的 16
          fontFamily: "inherit",
          fontSize: 14,
          lineHeight: "inherit",
          padding: 0,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {error || "设置"}
      </button>
      {mounted &&
        data &&
        createPortal(
          <SettingsDialog
            open={open}
            onClose={() => setOpen(false)}
            initialTheme={theme}
            data={data}
            onSaved={setData}
          />,
          document.body
        )}
    </>
  );
}
