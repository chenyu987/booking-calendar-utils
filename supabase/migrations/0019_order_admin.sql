-- 每个单子是哪个管理员的（排期总览按管理员筛）。
--
-- **为什么不从「客人是谁的」（person_contacts）算出来**：一个客人可以同时是 Admin1 和 admin2 的，
-- 他下的某一单到底是谁接的，从客人身上推不出来 —— 推不出来的事实才存。
--
-- 建单时填当前身份（排期总览标题旁边那个下拉）。可以为空：以前的单子、
-- 客户自己从 /customer 发的需求，都还没有归属。
--
-- restrict：还有单子挂在这个管理员名下就不让删管理员（跟 person_contacts 一样）
alter table orders add column admin_id uuid references admins(id) on delete restrict;
create index on orders (admin_id);

-- 主要管理员（存在 app_settings）：没写是谁的单子都算他的，他的单在排期总览上不上色。
-- 现在是 admin2 —— 大多数单子是她做的（2026-10-06 定的）。设置弹框里能改。
-- 以前的单**不补** admin_id：「没写 = 主要管理员的」是现算的，换了主要管理员它们跟着走
insert into app_settings (key, value)
select 'primary_admin_id', id::text from admins where name = 'admin2'
on conflict (key) do nothing;
