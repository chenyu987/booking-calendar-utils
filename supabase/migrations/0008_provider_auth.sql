-- 物主登录：跟 0007 给 customers 加的那一列完全对称
--
-- 注意这里**没有**做「角色切换」：客户和物主是两个独立入口，各自登录、各自认领。
-- 同一个人如果两边都用，库里会有两行（一行 customers 一行 providers）——
-- 这是有意接受的：没有切换 UI，就没有「同一份资料两个地方能改」那个坑，
-- 每边各是各的身份。合成一张 people 表的事（CLAUDE.md 待决定 #1）继续挂着。
alter table providers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists providers_auth_user_id_idx on providers (auth_user_id);
create index if not exists providers_email_lower_idx on providers (lower(email));
