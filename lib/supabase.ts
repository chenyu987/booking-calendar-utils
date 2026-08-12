import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // supabase-js 自己抛的错是 "supabaseUrl is required"，不好排查，这里换个说人话的
  throw new Error(
    "缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY。" +
      "把 .env.example 复制成 .env.local，去 Supabase 控制台 Project Settings → API 里抄这两个值。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
