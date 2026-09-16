import prodRefs from "./prodRefs.json";

// 这个部署连的是哪个库 —— 判断的**唯一出处**。
//
// 依据是 `NEXT_PUBLIC_SUPABASE_URL` 里的 project ref（`https://<ref>.supabase.co`），
// **不新加一个 NEXT_PUBLIC_APP_ENV 之类的变量**。多一个变量就多一处要跟着对的东西：
// 换库时改了 URL、忘了改它，横幅就开始说谎 —— 正是这个项目栽过四次的
// 「同一件事存两处」。ref 是从 URL 算出来的，对不上是不可能的。
//
// **认不出来一律算 test。** 拼错、漏配、新开一个库忘了登记，结果都是
// 「显示警告条」而不是「默默装成 prod」。默认值要倒向安全的那一侧 ——
// 跟 `itemConflictReason` 那句「判断不了就不拦」是同一条精神反过来用：
// 那边宁可漏拦不能错拦，这边宁可错报不能漏报。
//
// prod 的 ref 写在 `lib/prodRefs.json` 里（不是这个文件），因为
// `scripts/db.mjs` 也要读它来拦「把种子数据灌进 prod」，而 node 读不了 TS。
// 一份 JSON 两边 import，不存在第二份名单。
// ref 不是密钥：它本来就在发到浏览器的那个 URL 里，进版本库没问题。

export type AppEnv = "prod" | "test";

const PROD_REFS: readonly string[] = prodRefs.refs;

/** 从 Supabase 的 API URL 里取 project ref；不是这个形状就返回 null */
export function projectRef(supabaseUrl: string | null | undefined): string | null {
  if (!supabaseUrl) return null;
  // 结尾必须是主机名的尽头（端口 / 路径 / 字符串到头），不能只写 `\b` ——
  // `\b` 会让 `evil.supabase.co.attacker.com` 也匹配上，取出个 "evil" 来。
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)(?::\d+)?(?:\/|$)/i.exec(
    supabaseUrl.trim()
  );
  return m ? m[1].toLowerCase() : null;
}

/** 这个 URL 指向的是 prod 还是 test。认不出来算 test（见上面「倒向安全的一侧」） */
export function appEnv(supabaseUrl: string | null | undefined): AppEnv {
  const ref = projectRef(supabaseUrl);
  return ref && PROD_REFS.includes(ref) ? "prod" : "test";
}
