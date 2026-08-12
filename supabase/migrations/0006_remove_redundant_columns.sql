-- 清理两处冗余字段
--
-- 第一次建表的话跑 0001 就够了，里面已经不含这些字段。
-- 这个文件是给「已经建好表」的情况用的增量迁移。

-- 1) order_notes.payment_method 跟 payments.method 记的是同一件事，
--    两个地方各存一份迟早对不上。付款方式以 payments 表为准。
alter table order_notes drop column if exists payment_method;

-- 2) matches.provider_id 能从 resource_id -> resources.provider_id 推出来，
--    是冗余外键。跟之前从 orders 上删掉 resource_id 是同一类问题：
--    同一个事实存两份，改了一处忘了另一处就会不一致。
alter table matches drop column if exists provider_id;
