-- 重新定义 resources.status 的含义
--
-- 问题：原来的 open/matched/occupied 想表达「这个资源被占了没」，但这是个假命题。
-- 一个资源可能 9/10-9/12 被占、9/15-9/20 还空着，一个全局状态表达不了。
-- 而且分配时改成 matched、退单时要记得改回 open，迟早跟实际排期对不上。
--
-- 改法：status 只表达「这个挂牌还在不在出租」——这是只有人知道、算不出来的信息。
-- 「哪几天被占了」由 order_assignments + orders.demand_days 实时算出来。
-- 「过期了没」拿 date_range_end 跟今天比，也不用存。

alter table resources drop constraint if exists resources_status_check;

update resources set status = 'active'
  where status in ('open', 'matched', 'occupied');

update resources set status = 'archived'
  where status = 'expired';

alter table resources
  add constraint resources_status_check
  check (status in ('active', 'paused', 'archived'));

alter table resources alter column status set default 'active';
