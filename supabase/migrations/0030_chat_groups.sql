-- 需求页上加群、改名、停抓（active = false）。采集 Mac 每次 run 开始时经 Supabase 函数
-- ingest-chat-requests 拉 active 的名单（那个 token 只读得到这张表的 id 和 name），
-- 拉不到就用上次存在本地的那份。
--
-- name 要跟聊天左栏里显示的**一字不差**：采集器按名字在左栏里找、点开后再拿标题栏核对。
-- 群主改了群名，这里跟着改名就行，以前的需求还挂在同一个群上（group_id 没变）。
--
-- **不给删，只能停**：删了的话挂在它上面的需求就没了来处。外键是 on delete restrict。
create table chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

alter table chat_groups enable row level security;

create trigger log_change after insert or update or delete on chat_groups
  for each row execute function log_change();

-- 需求挂到群上。group_name 留着：那是**抓的那一刻**群叫什么，群后来改名了也看得出当时是哪儿。
-- 可空：0030 之前进来的、或者采集 Mac 还没拿到名单时进来的，没有 group_id，页面上按 group_name 显示。
alter table chat_requests
  add column group_id uuid references chat_groups (id) on delete restrict;

create index chat_requests_group_idx on chat_requests (group_id);
