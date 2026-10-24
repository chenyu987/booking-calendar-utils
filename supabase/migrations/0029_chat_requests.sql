-- **不存「对上了哪个老客户」**：发言人的昵称对 people.chat_name 在页面上现算
-- （lib/chatRequests.ts 的 matchRequestPerson）。存成 person_id 的话，客人改了昵称、或者后来才建档，
-- 那一列就过期了 —— 「能算出来的不要存」。
--
--
-- dates 是 'MM-DD' 文本数组不是 date[]：模型从「3/14」「这周六」推出来的，年份它不知道，
-- 硬转成 date 等于替它猜了一个年份。sent_at 同理，存的是聊天里显示的样子。
create table chat_requests (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique,
  group_name text not null,
  sender text not null,
  item_type text not null default 'unknown' check (item_type in ('alpha', 'beta', 'unknown')),
  location text,
  dates text[] not null default '{}',
  male int not null default 0 check (male >= 0),
  female int not null default 0 check (female >= 0),
  quote text not null,
  sent_at text,
  extractor_note text,
  -- 截图时间；截图本身不上传，screenshot 是采集 Mac 上的文件名，要看原图去那台机器上找
  captured_at timestamptz,
  screenshot text,
  model text,
  prompt_version text,
  -- 跟进状态：new 新的 / contacted 已联系 / won 成交 / ignored 不跟。谁改的看改动记录
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'ignored')),
  admin_note text,
  created_at timestamptz not null default now()
);

create index chat_requests_status_created_idx on chat_requests (status, created_at desc);

alter table chat_requests enable row level security;

create trigger log_change after insert or update or delete on chat_requests
  for each row execute function log_change();
