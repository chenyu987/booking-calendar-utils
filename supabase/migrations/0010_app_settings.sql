-- 后台的设置项。key/value 一行一条。
--
-- 为什么是 KV 不是一行多列：设置会零零散散地加（起始日期、以后可能还有默认
-- 缩放、默认每行几天……），一个设置一个迁移太重。取值那一层在
-- lib/appSettings.ts 里包好，调用方不直接碰字符串。
--
-- 注意：这里只放**跨设备该一致**的东西。缩放、面板收起、每行几天那些是
-- 「这台机器上我习惯怎么看」，继续留在 cookie 里，别往这搬。
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
