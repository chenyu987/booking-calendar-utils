-- 客户登录：把 Supabase Auth 的用户跟 customers 表对上
--
-- 为什么要这一列：在这之前系统里没有「当前访问者是谁」这个概念，
-- /customer/request 是拿手机号当身份的 —— 输谁的手机号就是谁。有了这一列，
-- 「谁登录了」才有可信答案，后面的余量日历、客户建单、RLS 都建在它上面。
--
-- unique：一个 auth 用户只能认领一个 customer，防止同一个人在库里裂成两行。
alter table customers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- 登录后按 auth_user_id 查自己那一行，每次进 /customer 都要走一次
create index if not exists customers_auth_user_id_idx on customers (auth_user_id);

-- 认领老数据靠邮箱匹配（customers.email 早就有了），大小写不敏感
create index if not exists customers_email_lower_idx on customers (lower(email));
