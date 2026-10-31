"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimProvider } from "@/lib/accountClaim";
import { serializeValidity } from "@/lib/validity";
import { chatGap } from "@/lib/selfClaim";

// 挂资源。**身份来自登录，不再来自手机号** —— 以前这个页面是「输谁的手机号就是谁」，
// 跟 /customer/request 犯的是同一个错，一并改掉。
// 放在单独的文件里（不内联在 page.tsx）是为了 tests/ 能直接调它，跟 customer/request/actions.ts 一样
export async function submitListing(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=provider");
  const providerId = await claimProvider(user.id, user.email ?? null);

  // 称呼和联系方式顺手存回这个人身上（people）：认领出来的那行只有邮箱，
  // 有人要租的时候得能联系到物主。
  //
  // **昵称 + 账号都必填**（跟客户同一把尺，lib/selfClaim.ts 的 chatGap）——
  // 账号是通知物主用的；昵称是跟库里老物主对上用的（Provider 管理顶上「可能是老物主」）。
  // 输入框上有 required，这里再拦一道：那个只挡浏览器。拦住时一行都不写
  const firstName = ((formData.get("first_name") as string) ?? "").trim();
  const phone = ((formData.get("phone_number") as string) ?? "").trim();
  const chatName = ((formData.get("chat_name") as string) ?? "").trim();
  const chat = ((formData.get("chat_id") as string) ?? "").trim();
  if (chatGap({ chat_name: chatName, chat_id: chat })) redirect("/provider/listing?error=chat");

  const profile: Record<string, string> = { chat_name: chatName, chat_id: chat };
  if (firstName) profile.first_name = firstName;
  if (phone) profile.phone_number = phone;
  await supabase.from("people").update(profile).eq("id", providerId);

  const { error: resourceError } = await supabase.from("resources").insert({
    provider_id: providerId,
    item_type: formData.get("item_type") as string,
    holder_name: formData.get("holder_name") as string,
    holder_gender: formData.get("holder_gender") as string,
    holder_date_of_birth: (formData.get("holder_date_of_birth") as string) || null,
    // 有效期两头各自选填，留空 = 这一头不设限（lib/validity.ts）。新挂的资源只有一段
    validity: serializeValidity([
      {
        start: (formData.get("start_date") as string) || null,
        end: (formData.get("end_date") as string) || null,
      },
    ]),
    status: "active",
  });
  if (resourceError) throw new Error(resourceError.message);

  revalidatePath("/provider");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/resources");
  revalidatePath("/admin/providers");
  redirect("/provider?listed=1");
}
