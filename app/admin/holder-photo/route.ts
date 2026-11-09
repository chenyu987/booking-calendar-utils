import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { HOLDER_PHOTO_BUCKET, MAX_UPLOAD_BYTES, holderPhotoPath, isHolderPhotoPath } from "@/lib/holderPhoto";

// 持有人照片：/admin/holder-photo?p=<资源 id>/<时间戳>.jpg
//
// 谁能看：在 /admin 底下，middleware 先验了管理员登录才走得到这儿（没登录 401 / 跳登录页）。
// 桶是私有的，这里用 service key 取出来回给浏览器。为什么网址带路径、为什么不以 .jpg 结尾，
// 见 lib/holderPhoto.ts 开头。
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p");
  if (!isHolderPhotoPath(p)) return new NextResponse("没有这张照片", { status: 404 });

  const { data, error } = await supabase.storage.from(HOLDER_PHOTO_BUCKET).download(p);
  if (error || !data) return new NextResponse("没有这张照片", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      // 换照片就换路径，同一个网址的内容永远不变，可以一直缓存。
      // private：只存在这台电脑的浏览器里，中间的 CDN / 代理不许存（这是要登录才看得到的东西）
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// 上传 / 换持有人照片：POST multipart，字段 resourceId + file（Resource 管理编辑那一行的「上传照片」）。
//
// 谁能传：同样只有管理员（middleware）。这里再管几件界面上管不住的事（有人直接 curl 过来）：
//   · 只收 jpg，而且看文件头，不信 Content-Type —— 桶里只放一种东西，GET 那边也只按 jpg 回
//   · 大小有上限
//   · 资源要存在、没被删
// 先传文件、再写库；写库失败把刚传的文件删掉，不留孤儿。成功后旧照片删掉（失败也不要紧，只是占点地方）。
// 写库走 lib/supabase 的 client，会带上是哪个管理员改的（改动记录里看得到）。
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const resourceId = form.get("resourceId");
  const file = form.get("file");
  if (typeof resourceId !== "string" || !resourceId) return NextResponse.json({ error: "缺 resourceId" }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "没选照片" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "照片太大了（最多 2MB）" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg) return NextResponse.json({ error: "只收 jpg 照片" }, { status: 400 });

  let path: string;
  try {
    path = holderPhotoPath(resourceId, Date.now());
  } catch {
    return NextResponse.json({ error: "没有这个资源" }, { status: 404 });
  }

  const { data: resource, error: readErr } = await supabase
    .from("resources")
    .select("id, deleted_at, holder_photo_path")
    .eq("id", resourceId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: `读资源失败：${readErr.message}` }, { status: 500 });
  if (!resource || resource.deleted_at) return NextResponse.json({ error: "没有这个资源（或者已经删了）" }, { status: 404 });

  const bucket = supabase.storage.from(HOLDER_PHOTO_BUCKET);
  const up = await bucket.upload(path, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  if (up.error) return NextResponse.json({ error: `上传失败：${up.error.message}` }, { status: 500 });

  const { error: updErr } = await supabase.from("resources").update({ holder_photo_path: path }).eq("id", resourceId);
  if (updErr) {
    await bucket.remove([path]);
    return NextResponse.json({ error: `保存失败：${updErr.message}` }, { status: 500 });
  }

  if (isHolderPhotoPath(resource.holder_photo_path) && resource.holder_photo_path !== path) {
    await bucket.remove([resource.holder_photo_path]);
  }
  return NextResponse.json({ path });
}
