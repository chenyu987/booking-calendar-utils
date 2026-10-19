import { headers } from "next/headers";

import { ADMIN_ID_HEADER } from "./adminAuth";

/**
 * 当前身份（admins.id）：标题旁边下拉选的那个，没选过就是登录的那个人。
 * middleware 验完登录才写进请求头（lib/adminAuth.ts 的 pickAdminIdentity），没登录拿不到
 */
export async function currentAdminId(): Promise<string | null> {
  return (await headers()).get(ADMIN_ID_HEADER) || null;
}
