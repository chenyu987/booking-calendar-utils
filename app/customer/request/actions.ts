"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabaseServer";
import { claimCustomer } from "@/lib/accountClaim";
import { dateRangeToArray } from "@/lib/dates";
import { chatGap } from "@/lib/selfClaim";

// 发租借需求。联系方式不在这儿填 —— 那是 /customer 上「个人资料」的事，
// 同一份信息两个地方能改，早晚对不上。
//
// 身份来自登录，**不再来自手机号** —— 以前这个页面是「输谁的手机号就是谁」，
// 有了 magic link 登录之后那套必须废掉，否则同一个人会在库里裂成两行：
// 一行挂在他的账号上（/customer 看到的），一行挂在他填的手机号上（这个表单造的）。
export async function submitRequest(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = await claimCustomer(user.id, user.email ?? null);

  // 昵称和账号不齐不让发（2026-10-25 用户定的）。界面上表单是灰的，但 curl 绕得过去，所以这里再拦一次
  const { data: me } = await supabase
    .from("people")
    .select("chat_name, chat_id")
    .eq("id", customerId)
    .maybeSingle();
  if (chatGap(me)) redirect("/customer/request?error=chat");

  const maleCount = Number(formData.get("male_count") ?? 0);
  const femaleCount = Number(formData.get("female_count") ?? 0);
  if (maleCount + femaleCount < 1) {
    redirect("/customer/request?error=party");
  }

  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  if (!startDate || !endDate || endDate < startDate) {
    redirect("/customer/request?error=dates");
  }
  const demandDays = dateRangeToArray(startDate, endDate);

  // amount 存总价：单价 × 天数 × 人数，跟 admin 那边算法一致
  const pricePerDay = formData.get("budget") ? Number(formData.get("budget")) : 40;
  const amount = pricePerDay * demandDays.length * (maleCount + femaleCount);

  const { error: orderError } = await supabase.from("orders").insert({
    customer_id: customerId,
    location: ((formData.get("location") as string) ?? "").trim() || null,
    male_count: maleCount,
    female_count: femaleCount,
    amount,
    demand_days: demandDays,
    status: "created",
  });
  if (orderError) redirect("/customer/request?error=save");

  revalidatePath("/customer");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");
  redirect("/customer?created=1");
}
