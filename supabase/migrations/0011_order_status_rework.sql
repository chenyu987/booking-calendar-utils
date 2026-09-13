-- 订单状态改版
--
--   - 去掉 refunded（已退款）
--   - 加 unconfirmed（未确认）：**人工**打的模糊态 —— 单子进来了，但人突然说不准
--     到底做不做。不是流程起点，起点仍然是 created（默认值不动）。
--     它的钱不算流水，见 lib/revenue.ts 的 NOT_REVENUE。
--   - 加 needRefund（需退款）：钱还在我们手上，欠着一笔要退。照常算流水，
--     真退完了改成 cancelled。
--
-- refunded 的历史单子迁到 cancelled：钱已经退完了，是个终态，
-- 跟 cancelled 一样「不算流水」；迁到 needRefund 语义正好反了（那是还没退）。
--
-- 顺序有讲究：**先迁数据再换约束**。反过来的话，库里还剩 refunded 的行，
-- 加约束那一步会直接失败。
update orders set status = 'cancelled' where status = 'refunded';

alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in (
    'created', 'itemAssigned', 'pendingPickUp', 'pendingPayment',
    'complete', 'unconfirmed', 'cancelled', 'needRefund'
  ));
