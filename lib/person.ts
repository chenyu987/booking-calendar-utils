// 后台怎么把一个人显示出来。**唯一出处** —— 别在页面里自己拼 first_name / last_name。
//
// 0020 / 0022 起：
//   first_name / last_name：**用户自己注册账号时填的称呼**。导入的人没有（0022 清空了 ——
//     那是导入时顺手复制的昵称，不是他们自己填的）
//   chat_name：昵称 —— 管理员加了好友后在后台填的
//   chat_id：账号 —— 选填
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

/** 称呼：名 + 姓。用户自己注册时填的，没填就是空串 */
export function selfName(p: Nameable): string {
  return [pick(p?.first_name), pick(p?.last_name)].filter(Boolean).join(" ");
}

/**
 * **后台**显示用的名字（排期总览、Customer / Provider 管理、匹配台、返点……）：**昵称优先** ——
 * 管理员是拿昵称认人的。没有昵称的（自己注册、管理员还没加好友的）退回他自己填的称呼，
 * 再没有用账号，都没有给 fallback（2026-10-06 定的）
 */
export function displayName(p: Nameable, fallback = "?"): string {
  return pick(p?.chat_name) || selfName(p) || pick(p?.chat_id) || fallback;
}

/**
 * **用户自己的页面**（客户 / 物主登录后看到的「我的账号」）显示的名字：**称呼优先** ——
 * 他自己起的名字；没填称呼才用昵称，再没有用账号。跟后台那个顺序正好反过来，是有意的
 */
export function selfDisplayName(p: Nameable, fallback = ""): string {
  return selfName(p) || pick(p?.chat_name) || pick(p?.chat_id) || fallback;
}

/**
 * 后台显示出来的那个名字是哪一列 —— 在显示的地方直接改名字时（排期总览色块里），
 * 改的必须是这一列。有昵称改昵称；没有（显示的是称呼）才改称呼
 */
export function displayNameField(p: Nameable): "first_name" | "chat_name" {
  return pick(p?.chat_name) || !selfName(p) ? "chat_name" : "first_name";
}

/**
 * 「这个人是谁、怎么找他」一句话：「显示名 (账号)」。
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
