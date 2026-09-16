import { appEnv, projectRef } from "@/lib/env";

/**
 * 「你现在连的是测试库」那条。**只在非 prod 显示。**
 *
 * 方向是故意这么定的：有条子 = 随便改，没条子 = 这是真数据、当心。
 * 反过来做（prod 才挂条警告）的话，任何一次漏配都会让 prod 看起来像测试环境 ——
 * 而人看不见警告的时候正是最放心乱点的时候。判断本身在 `lib/env.ts`，
 * 认不出来的库一律算 test，所以「漏配」的结果是多显示一条，不是少显示一条。
 *
 * 挂在侧边栏顶上。侧边栏能拖到 0 宽，那时这条也跟着没了 —— 可以接受，
 * 因为丢失信息的方向仍然是「看起来像 prod」，往当心那边倒。
 */
export default function EnvBanner() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (appEnv(url) === "prod") return null;
  const ref = projectRef(url);

  return (
    <div
      style={{
        background: "var(--notice-bg)",
        border: "1px solid var(--notice-border)",
        borderRadius: 4,
        padding: "4px 8px",
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--warn)",
          whiteSpace: "nowrap",
        }}
      >
        测试库 · 数据随便改
      </div>
      {/* 把 ref 亮出来：光说「测试」不够，有两个库之后要能一眼确认是哪一个 */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-faint)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {ref ?? "认不出这个库"}
      </div>
    </div>
  );
}
