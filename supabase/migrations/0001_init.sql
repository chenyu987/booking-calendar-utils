
create extension if not exists "pgcrypto";

-- Customer 求物品人
create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  -- 只存生日，年龄用代码算（lib/age.ts），存死数字明年就错了
  date_of_birth date,
  email text,
  phone_number text,
  chat text,
  status text not null default 'active',
  note text,
  -- 客户登录后对应的 Supabase Auth 用户。unique：一个 auth 用户只认领一行，
  -- 免得同一个人在库里裂成两条（0007）
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on customers (auth_user_id);
create index on customers (lower(email));

-- Provider 物主（账号层面。一个 Provider 可以持多个人的资源，
-- 所以资源本身的信息 —— 资源类型、持有人姓名/性别/生日 —— 都在 resources 上）
create table providers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  date_of_birth date,
  email text,
  phone_number text,
  chat text,
  status text not null default 'active',
  note text,
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
  date_range_start date not null,
  date_range_end date not null,
  -- 只表达「这个挂牌还在不在出租」。哪几天被占了由 order_assignments 算出来，
  -- 过期与否拿 date_range_end 跟今天比，都不存字段，避免跟实际排期不同步。
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
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
    check (status in (
      'created', 'itemAssigned', 'pendingPickUp', 'pendingPayment',
      'complete', 'cancelled', 'refunded'
    )),
  created_at timestamptz not null default now()
);
create index on orders (customer_id);
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
