import { describe, it, expect, vi } from "vitest";
import { projectRef, appEnv } from "./env";

// prodRefs.json 现在是空的（prod 库还没建），所以「在名单里 = prod」这条
// 用 mock 来验：等 prod 建好把 ref 填进去，这两组断言不用改。
vi.mock("./prodRefs.json", () => ({ default: { refs: ["realprodref0000000a"] } }));

describe("projectRef", () => {
  it("从 API URL 里取出 ref", () => {
    expect(projectRef("https://testprojectref000001.supabase.co")).toBe("testprojectref000001");
  });

  it("带路径、带斜杠、大小写混着都认", () => {
    expect(projectRef("https://ABCdef123.supabase.co/rest/v1/")).toBe("abcdef123");
  });

  it("不是这个形状就返回 null，不瞎猜", () => {
    expect(projectRef("http://localhost:54321")).toBeNull();
    expect(projectRef("https://supabase.co")).toBeNull();
    expect(projectRef(undefined)).toBeNull();
    expect(projectRef("")).toBeNull();
  });

  it("**不能被伪装成 supabase.co 的域名骗过去**", () => {
    expect(projectRef("https://evil.supabase.co.attacker.com")).toBeNull();
  });
});

describe("appEnv", () => {
  it("ref 在名单里才算 prod", () => {
    expect(appEnv("https://realprodref0000000a.supabase.co")).toBe("prod");
  });

  // 这条是整个文件的重点：**漏配的默认值必须是 test**。
  // 反过来写（认不出来算 prod）的话，一个拼错的 URL 就能让测试库不显示警告条，
  // 而人看不见警告条时正是最放心乱改的时候。
  it("认不出来的一律算 test —— 漏报警告条比漏报危险", () => {
    expect(appEnv("https://testprojectref000001.supabase.co")).toBe("test");
    expect(appEnv("http://localhost:54321")).toBe("test");
    expect(appEnv(undefined)).toBe("test");
    expect(appEnv("")).toBe("test");
  });
});
