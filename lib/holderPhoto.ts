// 持有人照片（迁移 0033）。
//
// 照片在 Supabase Storage 的私有桶里，库里 resources.holder_photo_path 记路径。
// 浏览器拿不到 service key、桶也不公开，所以页面上的 <img> 指向 /admin/holder-photo?p=<路径>：
// middleware 先验管理员登录（/admin 底下全验），route 再用 service key 从桶里取出来回给浏览器。
//
//
// **网址不以 .jpg 结尾**：middleware 的 matcher 跳过 .jpg/.png 结尾的路径（静态图片不验登录），
// 照片要是走成 /admin/holder-photo/xxx.jpg 就绕过了登录检查。

export const HOLDER_PHOTO_BUCKET = "holder-photos";

/** 上传的照片最大多少。浏览器那边先缩成 480px 宽的 jpg（app/admin/resources/HolderPhotoUpload.tsx），正常几十 KB */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const PATH_RE = /^[0-9A-Za-z-]{1,64}\/\d{1,16}\.jpg$/;

export function isHolderPhotoPath(p: unknown): p is string {
  return typeof p === "string" && PATH_RE.test(p);
}

/** 新照片存到哪儿。version 一般传 Date.now()，换照片就换路径 */
export function holderPhotoPath(resourceId: string, version: number): string {
  const p = `${resourceId}/${Math.trunc(version)}.jpg`;
  if (!isHolderPhotoPath(p)) throw new Error(`资源 id 只能有字母数字和横线：${resourceId}`);
  return p;
}

/** 页面上 <img src> 用的网址；没照片返回 null */
export function holderPhotoUrl(path: string | null | undefined): string | null {
  return isHolderPhotoPath(path) ? `/admin/holder-photo?p=${encodeURIComponent(path)}` : null;
}
