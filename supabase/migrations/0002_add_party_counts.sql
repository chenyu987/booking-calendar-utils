-- 给 orders 加人数字段（男/女各几人）
--
-- 如果你还没执行过 0001_init.sql，直接跑 0001 就行，里面已经包含这些字段，不用跑这个文件。
-- 这个文件是给「已经建好表」的情况用的增量迁移。

alter table orders
  add column if not exists male_count int not null default 0 check (male_count >= 0),
  add column if not exists female_count int not null default 0 check (female_count >= 0);

alter table orders
  add column if not exists party_size int
  generated always as (male_count + female_count) stored;
