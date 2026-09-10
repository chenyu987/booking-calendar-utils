import { defineConfig, devices } from "@playwright/test";

// 浏览器测试。**跑在 GitHub 的机器上**（CI 里临时开一台，跑完销毁），
// 不碰任何人的日常浏览器。
//
// 为什么需要它：这个项目最容易反复出问题的那类 bug —— 进出分配态错开几像素、
// 点下去没有即时反馈、Esc 之后残留蓝边 —— 全都只有真渲染出来才量得到，
// 纯逻辑的单元测试和 Route Handler 的集成测试一条都盖不到。
//
// 数据走内存假库（E2E=1 时 next.config.js 把 lib/supabase 换掉），不连真库。
export default defineConfig({
  testDir: "./tests/e2e",
  // 只跑 .spec.ts；seed.ts / supabaseStub.ts 是给构建用的，不是测试
  testMatch: /.*\.spec\.ts/,
  // 这些断言量的是像素和时序，并发跑会互相影响（共用一个 dev server 和同一份
  // 内存数据），老老实实串行
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    // 失败时留下截图和 trace，CI 上出问题不用靠猜
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // 窗口够宽，色块才不会被挤到换行，坐标才稳定
    viewport: { width: 1600, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 用 next start 跑构建产物，不用 dev：dev 每个页面首次访问都要现编译，
    // 第一条测试会等好几秒，还容易在 CI 上超时
    command: "npm run build:e2e && npx next start -p 3100",
    url: "http://127.0.0.1:3100/admin/overview",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E: "1",
      // 假库不看这两个值，但 lib/supabase.ts 在没被替换的代码路径上会校验，
      // 给个占位免得构建报错
      NEXT_PUBLIC_SUPABASE_URL: "https://e2e.placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder",
    },
  },
});
