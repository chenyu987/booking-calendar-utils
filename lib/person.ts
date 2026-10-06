// 后台怎么把一个人显示出来。**唯一出处** —— 别在页面里自己拼 first_name / last_name。
//
// 0020 起：
//   chat_name：昵称 —— 后台认人、显示用的就是它（排期总览色块上那个名字）
//   chat_id：账号 —— 选填
//   first_name / last_name：以后注册的用户自己填的称呼，大多数人是空的
//
// **只在 admin 侧用。** 客户的联系方式不能出现在物主那边，物主的也不能出现在客户那边
// （CLAUDE.md：那是双方的隐私，也是平台作为中间人的价值）—— 那两边根本不查这些字段。
//
// 纯函数，不碰数据库：客户端组件也能 import。

/** 显示一个人时要用到的那几列。查的时候 personSpread(DISPLAY_COLUMNS) 一次取齐 */
export const DISPLAY_COLUMNS = "chat_name, chat_id, first_name, last_name" as const;

export type Nameable =
  | {
      chat_name?: string | null;
      chat_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }
  | null
  | undefined;

const pick = (v?: string | null) => (v ?? "").trim();

/**
 * 显示用的名字：昵称优先。没有昵称的（以后自己注册、还没被管理员加过的人）
 * 退回他自己填的称呼，再没有就用账号，都没有给 fallback
 */
export function displayName(p: Nameable, fallback = "?"): string {
  return (
    pick(p?.chat_name) ||
    [pick(p?.first_name), pick(p?.last_name)].filter(Boolean).join(" ") ||
    pick(p?.chat_id) ||
    fallback
  );
}

/**
 * 「这个人是谁、怎么找他」一句话：「昵称 (账号)」。
 *
 * 匹配台上同一行里 Provider 和客户是并排的，写法必须一致 —— 一边是「Zoey (zqwer5578)」
 * 另一边只有个「小明」，看着像客户那边信息缺了一半，其实只是没取。
 * 账号没填就只有名字；名字本身就是退回来的账号时不重复写两遍
 */
export function formatPerson(p: Nameable): string {
  const name = displayName(p, "");
  const id = pick(p?.chat_id);
  if (!name) return "-";
  return id && id !== name ? `${name} (${id})` : name;
}
