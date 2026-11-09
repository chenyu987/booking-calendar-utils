"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HolderAvatar from "@/app/admin/overview/HolderAvatar";

// Resource 管理编辑那一行：点头像上传 / 换照片。选了图马上传，不等点「保存」——
// 照片走自己的接口（POST /admin/holder-photo），跟那一行的表单是两回事；
// 而且这个按钮就在表单里面，**必须是 type="button"**，不然一点就把整行提交了。
//
// 传之前在浏览器里缩成 480px 宽的 jpg：手机拍的原图好几 MB，分配页一次列一百多个资源；
// 服务端只收 2MB 以内的 jpg（看文件头），png / webp 在这儿一并转成 jpg。
// iPhone 的 HEIC 只有 Safari 认得出来，别的浏览器会读失败，提示换一张。
const WIDTH = 480;

async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, WIDTH / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    // png 透明的地方转 jpg 会变黑，先铺白底
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("转换失败"))), "image/jpeg", 0.85)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function HolderPhotoUpload({
  resourceId,
  path,
  name,
}: {
  resourceId: string;
  path: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let jpeg: Blob;
      try {
        jpeg = await toJpeg(file);
      } catch {
        throw new Error("这张图浏览器打不开（iPhone 的 HEIC？先存成 jpg 再传）");
      }
      const fd = new FormData();
      fd.set("resourceId", resourceId);
      fd.set("file", jpeg, "photo.jpg");
      const res = await fetch("/admin/holder-photo", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `上传失败（${res.status}）`);
      setCurrent(body.path);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      // 头像那一格放不下一行字，失败了直接弹出来说清楚
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  // 点头像就传。这一格本来就窄（物主姓名），再塞一个按钮名字就看不见了，
  // 所以头像本身当按钮，右下角一个小相机表示「点这里换」
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => input.current?.click()}
      title={error ?? (busy ? "上传中…" : current ? "点头像换照片" : "点这里上传照片")}
      aria-label={current ? "换照片" : "上传照片"}
      style={{
        position: "relative",
        flexShrink: 0,
        padding: 0,
        border: "none",
        background: "none",
        borderRadius: "50%",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.5 : 1,
        outline: error ? "2px solid var(--danger, crimson)" : undefined,
        outlineOffset: 1,
      }}
    >
      <HolderAvatar path={current} name={name} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: -3,
          bottom: -3,
          fontSize: 10,
          lineHeight: "14px",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        📷
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        // 不带 name：不跟着那一行的表单一起提交
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </button>
  );
}
