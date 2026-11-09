// E2E 构建时顶掉 lib/supabase.ts 的那份「数据库」。
//
// 为什么要顶掉：浏览器测试要跑**真页面**（排期总览的错位、即时反馈、多选这些，
// 只有真渲染出来才量得到），但不能连真库 —— CI 里放线上密钥等于让测试写坏
// 真数据，在 CI 里起一整套 Supabase 又慢又跟要验的东西无关。
//
// 只在 `E2E=1` 的构建里通过 next.config.js 的 alias 生效，生产构建碰都碰不到。
import { createFakeSupabase } from "../fakeSupabase";
import { SEED } from "./seed";

// 持有人照片：种子里 s-male / s-female 挂了照片（s-later 没有，看「没照片」那种样子）。
// 用一张纯色 SVG 顶替，不往仓库里放真人照片
const fakePhoto = (color: string) =>
  new Blob(
    [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50"><rect width="40" height="50" fill="${color}"/><circle cx="20" cy="18" r="9" fill="#fff8"/><rect x="8" y="31" width="24" height="19" rx="10" fill="#fff8"/></svg>`],
    { type: "image/svg+xml" },
  );

export const supabase = createFakeSupabase(SEED as any, {
  "holder-photos/s-male/1.jpg": fakePhoto("#5b8def"),
  "holder-photos/s-female/1.jpg": fakePhoto("#e8749a"),
}).client as any;
