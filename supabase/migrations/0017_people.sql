-- 人和身份分开：共有的信息进 people，customers / providers 只剩「这个人作为客户 / 物主」的东西。
--
-- 原来 customers 和 providers 各存一整套姓名、聊天、电话、邮箱、生日。同一个人既租又出租的话
-- 就裂成两行：改了聊天只改到一边，登录要分别认领两次，介绍关系也只能在客户之间建。
--
-- **共用 id**：customers.id / providers.id 就等于 people.id（同时是主键和指向 people 的外键）。
-- 这样 orders.customer_id、resources.provider_id、referral_payouts.referrer_id 一条都不用改 ——
-- 它们指向的还是原来那个 id，只是那个 id 现在也是「人」的 id。
--
-- 「这个人是什么身份」= 那张身份表里有没有他这一行，**不另存一个 role 字段**
-- （能算出来的不存，CLAUDE.md）。
--
-- 状态（正常/停用/黑名单）和备注放在人身上，只有一份（2026-10-06 定的）。

create table people (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  -- 只存生日，年龄用代码算（lib/age.ts）
  date_of_birth date,
  email text,
  phone_number text,
  chat text,
  status text not null default 'active',
  note text,
  -- 登录后对应的 Supabase Auth 用户。一个登录账号只对应一个人 ——
  -- 同一个人从客户入口、物主入口登录，落到的是同一行
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index people_email_lower_idx on people (lower(email));

-- ① 客户整批搬过去，id 原样
insert into people (
  id, first_name, last_name, date_of_birth, email, phone_number, chat,
  status, note, auth_user_id, created_at
)
select
  id, first_name, last_name, date_of_birth, email, phone_number, chat,
  status, note, auth_user_id, created_at
from customers;

-- ② 物主里**跟某个客户是同一个登录账号**的，合到那个客户身上。
--
-- 只认登录账号，不认聊天 / 电话 / 姓名：同一个账号一定是同一个人，后几样只是像。
-- 猜错一个，他的资源就挂到别人名下了，而页面上看着一切正常。像但不确定的那些
-- 不在迁移里合，要合的话逐对人工确认之后单独处理。
create temp table provider_merge as
select o.id as provider_id, r.id as person_id
from providers o
join customers r on r.auth_user_id = o.auth_user_id;

-- 共有字段：客户那边有值就留客户的，空着才拿物主的补上。
-- 两边都有值又不一样的，物主那边的值写进备注，不丢。
-- 状态取更严的那个（黑名单 > 停用 > 正常）；备注两段都留。
update people p
set
  first_name = coalesce(nullif(trim(p.first_name), ''), o.first_name),
  last_name = coalesce(nullif(trim(p.last_name), ''), o.last_name),
  date_of_birth = coalesce(p.date_of_birth, o.date_of_birth),
  email = coalesce(nullif(trim(p.email), ''), o.email),
  phone_number = coalesce(nullif(trim(p.phone_number), ''), o.phone_number),
  chat = coalesce(nullif(trim(p.chat), ''), o.chat),
  status = case
    when 'blacklisted' in (p.status, o.status) then 'blacklisted'
    when 'inactive' in (p.status, o.status) then 'inactive'
    else p.status
  end,
  note = nullif(concat_ws(E'\n',
    case when p.note is not null and o.note is not null then '客户：' || p.note else p.note end,
    case when p.note is not null and o.note is not null then '物主：' || o.note else o.note end,
    '合并前物主那边：' || nullif(concat_ws('，',
      case when lower(trim(o.first_name)) <> lower(trim(p.first_name)) then '名字 ' || trim(o.first_name) end,
      case when lower(trim(o.last_name)) <> lower(trim(p.last_name)) then '姓 ' || trim(o.last_name) end,
      case when lower(trim(o.chat)) <> lower(trim(p.chat)) then '聊天 ' || trim(o.chat) end,
      case when trim(o.phone_number) <> trim(p.phone_number) then '电话 ' || trim(o.phone_number) end,
      case when lower(trim(o.email)) <> lower(trim(p.email)) then '邮箱 ' || trim(o.email) end,
      case when o.date_of_birth <> p.date_of_birth then '生日 ' || o.date_of_birth end
    ), '')
  ), '')
from provider_merge m
join providers o on o.id = m.provider_id
where p.id = m.person_id;

-- 物主身份挪到这个人的 id 上：先建新的身份行，再把资源改挂过去，最后删旧行。
-- 顺序不能反 —— 先删旧行的话，resources 的外键会把他的资源一起 cascade 掉
insert into providers (id, created_at)
select m.person_id, o.created_at
from provider_merge m
join providers o on o.id = m.provider_id;

update resources s
set provider_id = m.person_id
from provider_merge m
where s.provider_id = m.provider_id;

delete from providers o
using provider_merge m
where o.id = m.provider_id;

-- ③ 剩下的物主各自是一个新的人，id 原样。
-- 万一某个物主的 id 恰好跟某个客户撞了（随机 uuid 不会，但种子数据是手写的），
-- 照原样插就会被「已存在」挡住或者被误当成同一个人 —— 直接停下，别猜
do $$
begin
  if exists (
    select 1 from providers o
    join people p on p.id = o.id
    where o.id not in (select person_id from provider_merge)
  ) then
    raise exception '有物主的 id 跟客户的 id 撞了，没法按原 id 搬，先人工处理';
  end if;
end $$;

insert into people (
  id, first_name, last_name, date_of_birth, email, phone_number, chat,
  status, note, auth_user_id, created_at
)
select
  id, first_name, last_name, date_of_birth, email, phone_number, chat,
  status, note, auth_user_id, created_at
from providers
where id not in (select person_id from provider_merge);

drop table provider_merge;

-- ④ 身份表只留自己的东西，id 改成指向 people。
-- 删列会把挂在这些列上的索引一起删掉（两边索引名字不一样的那几个也不用管了）。
-- 外键不起名字，让 Postgres 自动命名（customers_id_fkey）—— 跟 0001 从零建出来的同名
alter table customers
  drop column first_name,
  drop column last_name,
  drop column date_of_birth,
  drop column email,
  drop column phone_number,
  drop column chat,
  drop column status,
  drop column note,
  drop column auth_user_id,
  alter column id drop default,
  add foreign key (id) references people(id) on delete cascade;

alter table providers
  drop column first_name,
  drop column last_name,
  drop column date_of_birth,
  drop column email,
  drop column phone_number,
  drop column chat,
  drop column status,
  drop column note,
  drop column auth_user_id,
  alter column id drop default,
  add foreign key (id) references people(id) on delete cascade;
