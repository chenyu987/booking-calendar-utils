-- 介绍关系的**生效窗口**：只有活动日落在窗口里的单子才算返点。
-- 比如某条关系只在 2026-09-01 ~ 2026-12-01 之间算钱。
--
-- 跟 referral_rate 一样挂在**被介绍人**那一行上（关系本来就存在那儿）。
--
-- **两头各自可空，空 = 这一头不设限** —— 照抄 resources.date_range_start/end
-- （迁移 0012）那套约定，理由也一样：逼着填只会填进假日期，反倒把一笔
-- 合法的返点拦掉。不设窗口的关系两头都空，显示成「不限」。
--
-- 判断用的是**订单最早的那个活动日**（lib/revenue.ts 的 orderStartDay），
-- 跨界的单子整单算进开始那天所在的一侧、不按天拆 —— 跟流水的口径是同一把尺，
-- 拆的话同一单的钱会出现在窗口两边，加起来对不上。
alter table customers add column referral_from date;
alter table customers add column referral_until date;

-- 起点不能晚于终点。填反了的话窗口是空的，所有单子都不算返点，
-- 而界面上看着「明明设了窗口」—— 这种错要在写进去那一刻就拦住
alter table customers
  add constraint customers_referral_window_order
  check (referral_from is null or referral_until is null or referral_from <= referral_until);
