-- 一个订单可以配多个资源：1男1女就需要一张男资源 + 一张女资源
--
-- 原来 orders.resource_id 是单个外键，只能配一个资源，这是设计错误。
-- 参考实际业务：「两男 wsl 80 → justin, victor gao」= 两个人两个资源，一人一张。
--
-- 第一次建表的话跑 0001 就够了，里面已经包含这些改动。
-- 这个文件是给「已经建好表」的情况用的增量迁移。

create table if not exists order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 同一个资源不能重复配给同一个订单
  unique (order_id, resource_id)
);

create index if not exists order_assignments_order_idx on order_assignments (order_id);
create index if not exists order_assignments_resource_idx on order_assignments (resource_id);

-- 把已经配好的单资源分配搬进新表，不丢数据
insert into order_assignments (order_id, resource_id)
select id, resource_id from orders where resource_id is not null
on conflict do nothing;

alter table orders drop column if exists resource_id;
