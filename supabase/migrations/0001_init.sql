
create extension if not exists "pgcrypto";

-- 人（0017）。共有的信息 —— 姓名、联系方式、生日、登录账号、状态、备注 —— 只存一份。
-- 「这个人是客户 / 物主」不存字段，看 customers / providers 里有没有他这一行。
-- 同一个人既租又出租的话，两张身份表里各有一行，id 都等于这里的 id。
create table people (
  id uuid primary key default gen_random_uuid(),
  -- 昵称（0020）：后台认人、显示用的就是它。排在最前面 —— 这是最常用的那个名字
  chat_name text,
  -- 账号（0020）：选填
  chat_id text,
  -- 客户 / 物主自己页面上填的「称呼」。导入的数据里已经清空（0022）—— 那时跟 chat_name
  -- 是同一个名字存了两份。后台显示用 chat_name，没有昵称的才退回称呼
  first_name text,
  last_name text,
  -- 只存生日，年龄用代码算（lib/age.ts），存死数字明年就错了
  date_of_birth date,
  email text,
  phone_number text,
  status text not null default 'active',
  note text,
  -- 登录后对应的 Supabase Auth 用户。unique：一个登录账号只对应一个人，
  -- 从客户入口、物主入口登录落到的是同一行（0007/0008，0017 起挪到这儿）
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index people_email_lower_idx on people (lower(email));

-- 管理员（0018）。每个管理员对应一个加客人用的账号（Admin1 = 私人号，admin2 = 工作号）。
-- 是一张表 —— 加员工在设置里点一下，不是改代码。以后接 admin 登录就在这上面加 auth_user_id
create table admins (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
-- 列表按 created_at 排，同一条语句插的两行时间戳一样 —— admin2 晚一秒，Admin1 固定在前
insert into admins (name, created_at) values
  ('Admin1', now()),
  ('admin2', now() + interval '1 second');

-- 这个客人是哪个管理员加的。两个都加了 = 两行，不存 both
create table person_contacts (
  person_id uuid not null references people(id) on delete cascade,
  -- restrict：还有客人挂在这个管理员名下就不让删
  admin_id uuid not null references admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (person_id, admin_id)
);
create index on person_contacts (admin_id);

-- Customer 求物品人（身份表）。id 就是 people.id —— 主键同时是外键，
-- 所以 orders.customer_id 指向这里，也就等于指向了那个人
create table customers (
  id uuid primary key references people(id) on delete cascade,
  -- 介绍人返点（0014）：关系存在**被介绍人**这一行上，不在介绍人那行存一个 list。
  -- 「A 介绍了哪些人」= where referred_by = A，算出来的。数组存法要回答反方向的
  -- 「B 这一单该返给谁」得扫全表，而那才是高频的那个方向。
  referred_by uuid references customers(id) on delete set null,
  -- 建立关系那一刻的比例快照（0.1 = 10%），留空 = 跟随 app_settings 的全局默认。
  -- 不快照的话，改一次全局默认所有历史返点金额一起跳。
  referral_rate numeric(5, 4)
    check (referral_rate is null or (referral_rate >= 0 and referral_rate <= 1)),
  -- 返点生效窗口（0015）：只有活动日落在窗口里的单子才算返点。
  -- 两头各自可空，空 = 这一头不设限，跟 resources 的有效期同一套约定
  referral_from date,
  referral_until date,
  -- 成为客户的时间（人可能更早就以物主身份在库里了）
  created_at timestamptz not null default now(),
  -- 自己介绍自己拦在库层面。更长的环（A→B→A）check 表达不了，
  -- 写入时走 lib/referral.ts 的 referralBlockReason()
  constraint customers_no_self_referral
    check (referred_by is null or referred_by <> id),
  -- 窗口填反了的话所有单子都不算返点，而界面上看着像设好了。写进去那一刻就拦
  constraint customers_referral_window_order
    check (referral_from is null or referral_until is null or referral_from <= referral_until)
);
create index on customers (referred_by);

-- Provider 物主（身份表，id 就是 people.id）。一个 Provider 可以持多个人的资源，
-- 所以资源本身的信息 —— 资源类型、持有人姓名/性别/生日 —— 都在 resources 上
create table providers (
  id uuid primary key references people(id) on delete cascade,
  -- 成为物主的时间
  created_at timestamptz not null default now()
);

-- Resource Provider 挂出的可用资源
create table resources (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  item_type text check (item_type in ('beta', 'alpha')),
  -- 持有人信息：物品登记了使用人，匹配时性别年龄要对得上才能核验时
  holder_name text,
  holder_gender text check (holder_gender in ('male', 'female')),
  holder_date_of_birth date,
  -- 有效期：一组日期段（迁移 0023）。24/25 季能用、25/26 没续、26/27 又续上了，
  -- 存成 {[2024-11-01,2025-05-31),[2026-11-01,2027-05-31)}。每段两头各自可以不设限，
  -- 整季通用的资源就是 {(,)}。逼着填只会填进假日期，反倒在分配那一刻把合法的资源拦掉。
  -- 不许是空集合：哪天都不能用的资源改挂牌状态。读写见 lib/validity.ts
  validity datemultirange not null default '{(,)}'
    constraint resources_validity_not_empty check (not isempty(validity)),
  -- 只表达「这个挂牌还在不在出租」。哪几天被占了由 order_assignments 算出来，
  -- 过期与否拿有效期跟今天比，都不存字段，避免跟实际排期不同步。
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  -- 软删除：物主点「删除」只打时间戳，行留着。真删会顺着 cascade 把分配记录
  -- 一起带走，而订单还挂着 itemAssigned。物主那边看不见，admin 那边照常列出来
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on resources (provider_id);
create index on resources (status);

-- Order 订单（Customer 发起需求，匹配确认后关联到具体 Resource）
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  demand_days date[] not null,
  location text,
  male_count int not null default 0 check (male_count >= 0),
  female_count int not null default 0 check (female_count >= 0),
  -- 生成列：数据库自动维护，不会出现改了男数忘改总数的情况
  party_size int generated always as (male_count + female_count) stored,
  amount numeric(10, 2),
  status text not null default 'created'
    -- unconfirmed（未确认）/ needRefund（需退款）是人工状态，见 0011。
    -- created 仍然是唯一的起点，所以默认值不动。
    check (status in (
      'created', 'itemAssigned', 'pendingPickUp', 'pendingPayment',
      'complete', 'unconfirmed', 'cancelled', 'needRefund'
    )),
  -- 这一单是哪个管理员的（0019）。不从「客人是谁的」算：一个客人可以同时是两个人的，
  -- 某一单是谁接的推不出来。建单时填当前身份；以前的单、客户自己发的需求可以为空
  admin_id uuid references admins(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index on orders (customer_id);
create index on orders (admin_id);
create index on orders (status);

-- 订单分配：一个订单可以配多个资源（1男1女 = 一张男资源 + 一张女资源，一人一张）
create table order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (order_id, resource_id)
);
create index on order_assignments (order_id);
create index on order_assignments (resource_id);

-- OrderNote 订单备注（跟 Order 一对一）
-- 目前还没做录入界面，留着，后面要用来承接「加钱没商量」「受伤退一天」这类信息。
-- 注意：付款方式不放这里，以 payments.method 为准，避免同一件事存两份。
create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  pickup_method text,
  sales_channel text,
  special_request text,
  internal_note text,
  refund_note text
);

-- Payment 付款记录（一个 Order 可以有多笔，比如定金+尾款）
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null,
  method text check (method in (
    'zelle', 'venmo', 'cash', 'zhifubao', 'chat', 'payid', 'emt'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded')),
  created_at timestamptz not null default now()
);
create index on payments (order_id);

-- 返点付款记录（0014）。存的不是「该返多少」——那个是算出来的（订单金额 × 比例，
-- 见 lib/referral.ts）；这里存的是「钱真付出去了」这个事实。
-- 跟 matches（意向）vs order_assignments（事实）一个道理。
-- 不复用 payments：那张表 order_id not null，而且 lib/revenue.ts 的流水口径
-- 建在它和 orders 上，掺进反向的钱会把流水搅浑。
create table referral_payouts (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references customers(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null,
  method text check (method in (
    'zelle', 'venmo', 'cash', 'zhifubao', 'chat', 'payid', 'emt'
  )),
  note text,
  created_at timestamptz not null default now(),
  -- 一单对一个介绍人只返一次
  unique (order_id, referrer_id)
);
create index on referral_payouts (referrer_id);
create index on referral_payouts (order_id);

-- Match Provider 对某个 Order 的匹配意向
-- Match：匹配意向（谁想接这一单）。跟 order_assignments 不同 ——
-- matches 是「想配」，order_assignments 是「真的配上了」。
-- 不存 provider_id，因为能从 resource_id -> resources.provider_id 推出来。
create table matches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  status text not null default 'proposed'
    check (status in ('proposed', 'allowed', 'chosen', 'unfulfilled')),
  created_at timestamptz not null default now()
);
create index on matches (order_id);
create index on matches (resource_id);

-- Day note 日历上「这一天的备注」（跟订单无关，属于这一天本身）
-- 用日期当主键：一天只有一条，天然唯一。
create table day_notes (
  day date primary key,
  note text not null,
  updated_at timestamptz not null default now()
);

-- App settings 后台设置项（key/value）
-- 只放跨设备该一致的东西；缩放、面板收起这类「这台机器上的习惯」留在 cookie。
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
-- 主要管理员（0019）：没写是谁的单子都算他的，他的单在排期总览上不上色。现在是 admin2
insert into app_settings (key, value)
select 'primary_admin_id', id::text from admins where name = 'admin2';

-- 改动记录（0025）。为什么用 trigger、「谁」从哪来，见 0025_change_log.sql 的说明
create table change_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  table_name text not null,
  -- 被改的那一行的主键。主键不叫 id 的表（person_contacts、day_notes、app_settings）
  -- 用 trigger 参数里列的那几列拼，多列用「/」连
  row_id text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb,
  -- admins 不给删（各处都是 on delete restrict），set null 只是兜底
  admin_id uuid references admins(id) on delete set null,
  -- 不加外键：登录账号删了，记录不该跟着没
  auth_user_id uuid
);
create index on change_log (row_id);

-- 只给读。日志能被随手改掉就不叫日志了 —— 写入只走下面那个 security definer 函数。
-- （RLS 还是全关的，但 RLS 管的是行，这里收的是整张表的写权限，两回事）
revoke insert, update, delete, truncate on change_log from anon, authenticated;

create function log_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  key text;
  header text;
  actor uuid;
begin
  -- 什么都没变（或者只动了 updated_at）的 update 不记：upsert 同样的值会走到这儿
  if tg_op = 'UPDATE' and (old_j - 'updated_at') = (new_j - 'updated_at') then
    return null;
  end if;

  if tg_nargs = 0 then
    key := row_j ->> 'id';
  else
    for i in 0 .. tg_nargs - 1 loop
      key := concat_ws('/', key, row_j ->> tg_argv[i]);
    end loop;
  end if;

  -- 不经过 PostgREST（SQL Editor、psql）时这个设置不存在，missing_ok 给 null 或空串
  header := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-admin-id';
  select id into actor from admins where id::text = header;

  insert into change_log (table_name, row_id, op, old_row, new_row, admin_id, auth_user_id)
  values (tg_table_name, key, lower(tg_op), old_j, new_j, actor, auth.uid());
  return null;
end;
$$;

create trigger log_change after insert or update or delete on people
  for each row execute function log_change();
create trigger log_change after insert or update or delete on customers
  for each row execute function log_change();
create trigger log_change after insert or update or delete on providers
  for each row execute function log_change();
create trigger log_change after insert or update or delete on admins
  for each row execute function log_change();
create trigger log_change after insert or update or delete on person_contacts
  for each row execute function log_change('person_id', 'admin_id');
create trigger log_change after insert or update or delete on resources
  for each row execute function log_change();
create trigger log_change after insert or update or delete on orders
  for each row execute function log_change();
create trigger log_change after insert or update or delete on order_assignments
  for each row execute function log_change();
create trigger log_change after insert or update or delete on order_notes
  for each row execute function log_change();
create trigger log_change after insert or update or delete on payments
  for each row execute function log_change();
create trigger log_change after insert or update or delete on referral_payouts
  for each row execute function log_change();
create trigger log_change after insert or update or delete on matches
  for each row execute function log_change();
create trigger log_change after insert or update or delete on day_notes
  for each row execute function log_change('day');
-- app_settings 只记真设置。日历从哪天开始、每行几天这些是「怎么看」，拖一下滑块写一次，
-- 记进来全是噪音。WHEN 里 insert 不能引用 old、delete 不能引用 new，所以拆成两个
create trigger log_change after insert or update on app_settings
  for each row when (new.key in ('referral_rate_default', 'primary_admin_id'))
  execute function log_change('key');
create trigger log_change_delete after delete on app_settings
  for each row when (old.key in ('referral_rate_default', 'primary_admin_id'))
  execute function log_change('key');
