import { matchRequestPerson } from "@/lib/chatRequests";

// 自己登录进来的新人，是不是库里的老客人。
//
//
// 口径跟需求的老客户提示一样（matchRequestPerson）：精确匹配，只去两头空白，对上多个就当没对上。

export type ClaimPerson = {
  id: string;
  chat_name?: string | null;
  chat_id?: string | null;
  auth_user_id?: string | null;
};

/** 这个登录进来的人，对得上的老客人（没绑登录账号的那些里唯一对上的一个）；对不上 null */
export function oldSelfFor<P extends ClaimPerson>(me: P, people: P[]): P | null {
  if (!me.auth_user_id) return null;
  // 只在没绑登录账号的人里找：绑了的已经自己登录过，不会是同一个人
  const pool = people.filter((p) => p.id !== me.id && !p.auth_user_id);
  // 先拿他填的昵称对，再拿账号对 —— 库里昵称几乎人人有，账号没几个
  for (const q of [me.chat_name, me.chat_id]) {
    const hit = q ? matchRequestPerson(q, pool) : null;
    if (hit) return hit;
  }
  return null;
}

/** 所有「登录进来的新人 → 可能是的老客人」配对，给 Customer 管理顶上那块提示用 */
export function claimSuggestions<P extends ClaimPerson>(people: P[]): { me: P; old: P }[] {
  const out: { me: P; old: P }[] = [];
  for (const me of people) {
    const old = oldSelfFor(me, people);
    if (old) out.push({ me, old });
  }
  return out;
}

/**
 * 合并前的服务端校验：只许合「现在还提示着的那一对」。
 * 按钮藏起来不算数，直接 POST 两个 id 的话，不拦就能把任意两个人揉成一个。
 */
export function mergeBlockReason<P extends ClaimPerson>(
  dropId: string,
  keepId: string,
  people: P[],
): string | null {
  const me = people.find((p) => p.id === dropId);
  if (!me) return "找不到这个登录的人（可能刚合并过）";
  if (!me.auth_user_id) return "这个人没有登录账号，不是自己登录进来的新人";
  const old = oldSelfFor(me, people);
  if (!old || old.id !== keepId) return "这两个人现在对不上了（昵称可能刚改过），刷新再看";
  return null;
}

/**
 * 发需求之前聊天还差什么；齐了返回 null。
 * 两样都要：账号是管理员加好友用的，昵称是跟老客人对上用的（库里认人靠昵称，账号几乎没人有）。
 * 客户页上的提示和发需求的服务端拦截共用这一份
 */
export function chatGap(me?: { chat_name?: string | null; chat_id?: string | null } | null): string | null {
  const name = !!me?.chat_name?.trim();
  const id = !!me?.chat_id?.trim();
  if (name && id) return null;
  if (!name && !id) return "昵称和账号";
  return name ? "账号" : "昵称";
}
