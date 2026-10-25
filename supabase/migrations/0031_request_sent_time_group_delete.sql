-- 需求两处改动（2026-10-24）。
--
--
-- 2. 群可以删了（用户要的）。删群不删需求：需求的 group_id 置空，group_name 里还留着
--    抓的时候群叫什么，页面上照样看得出是哪个群来的。外键从 restrict 改成 set null。
alter table chat_requests add column sent_time timestamptz;

alter table chat_requests drop constraint chat_requests_group_id_fkey;
alter table chat_requests
  add constraint chat_requests_group_id_fkey
  foreign key (group_id) references chat_groups (id) on delete set null;
