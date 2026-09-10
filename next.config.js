/** @type {import('next').NextConfig} */
const path = require("path");

const E2E = process.env.E2E === "1";

const nextConfig = {
  // E2E 构建**必须**用自己的输出目录。默认的 .next 是跟 `next dev` 共用的，
  // 在开着 dev server 的目录里跑一次构建就会把它冲坏（页面全 404，得删了重启）。
  // CLAUDE.md 里记着这个坑，我自己还是撞了一次，所以从配置上堵掉：
  // 分开之后两边互不相干，一边开着 dev 一边跑浏览器测试也没事。
  distDir: E2E ? ".next-e2e" : ".next",
  experimental: {
    // Next.js 默认会在浏览器里缓存页面 30 秒，导致「明明存了但列表没变」。
    // 这是个后台管理工具，数据必须是最新的，所以关掉这层缓存。
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  webpack(config) {
    // E2E=1 时把数据库换成内存假库（tests/e2e/supabaseStub.ts）。
    // 浏览器测试要跑真页面才量得到错位和交互，但不能连真库：CI 里放线上密钥
    // 等于让测试写坏真数据。**只有显式设了 E2E=1 才替换**，正常构建走不到这儿。
    if (E2E) {
      const stub = path.resolve(__dirname, "tests/e2e/supabaseStub.ts");
      // 三种写法都挂上：Next 自己会处理 tsconfig 的 `@/*`，光写 "@/lib/supabase"
      // 未必轮得到我们这条。`$` 是 webpack 的精确匹配后缀。
      config.resolve.alias["@/lib/supabase$"] = stub;
      config.resolve.alias["@/lib/supabase"] = stub;
      config.resolve.alias[path.resolve(__dirname, "lib/supabase.ts")] = stub;
    }
    return config;
  },
};

module.exports = nextConfig;
