// E2E 构建时顶掉 lib/supabase.ts 的那份「数据库」。
//
// 为什么要顶掉：浏览器测试要跑**真页面**（排期总览的错位、即时反馈、多选这些，
// 只有真渲染出来才量得到），但不能连真库 —— CI 里放线上密钥等于让测试写坏
// 真数据，在 CI 里起一整套 Supabase 又慢又跟要验的东西无关。
//
// 只在 `E2E=1` 的构建里通过 next.config.js 的 alias 生效，生产构建碰都碰不到。
import { createFakeSupabase } from "../fakeSupabase";
import { SEED } from "./seed";

export const supabase = createFakeSupabase(SEED as any).client as any;
