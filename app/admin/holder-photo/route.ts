import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { HOLDER_PHOTO_BUCKET, isHolderPhotoPath } from "@/lib/holderPhoto";

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
