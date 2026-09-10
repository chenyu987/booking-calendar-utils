import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // 浏览器测试归 Playwright 管（tests/e2e/*.spec.ts）。vitest 默认连 *.spec.ts
    // 一起捞，捞到之后因为没有浏览器环境直接报错 —— 两边的地盘划清楚
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
