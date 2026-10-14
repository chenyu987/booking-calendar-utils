import { NextRequest, NextResponse } from "next/server";
import { saveCustomerEdit } from "../saveCustomer";

// Customer 管理「保存」的后台入口：点保存那一下界面当场就改好了（CustomerTable 先把新值画上去），
// 真正的写库在这儿异步做，存不上就把原因带回去，界面撤回并重新打开编辑态。
//
// 为什么不直接调 Server Action：Server Action 里 revalidatePath 了当前这一页，Next 会顺手
// 把整页重新渲染一遍、一起送回来 —— 这一页渲染一次要好几秒（全量拉订单算足迹），
// 正是要省掉的那一下。Route Handler 只回一句 ok，别的页面照样 revalidate。
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const result = await saveCustomerEdit(formData);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
