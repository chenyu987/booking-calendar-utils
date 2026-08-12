/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 默认会在浏览器里缓存页面 30 秒，导致「明明存了但列表没变」。
    // 这是个后台管理工具，数据必须是最新的，所以关掉这层缓存。
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

module.exports = nextConfig;
