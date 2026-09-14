import { redirect } from "next/navigation";

// 物主那边合成一页了（看需求 + 我的资源 + 联系方式全在 /provider），这个地址留着
// 只为了不打断已经发出去的链接和书签。**别在这儿再长出一页来** ——
// 两个落脚点正是合并前那个「来回跳」的毛病。
export default function ProviderMatchesRedirect() {
  redirect("/provider");
}
