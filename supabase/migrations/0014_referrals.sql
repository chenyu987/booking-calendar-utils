-- 介绍人返点：A 介绍 B 来租借，B 每下一单就给 A 一笔返点（默认 10%）。
--
-- **关系存在被介绍人那一行，不在介绍人那一行存一个 list。**
-- 一开始的想法是给 customers 加一列 `referred_people uuid[]`（一个人能介绍多个），
-- 这正是 CLAUDE.md 里栽过四次的那个模式，而且这里还额外坏在查询方向上：
--   - 数组存法要回答「B 这一单该返给谁」，得扫全表看谁的数组里有 B（b-tree 索引
--     用不上，得专门建 GIN）。而这个方向恰恰是高频的 —— 每看一单问一次。
--   - 加一条关系要写两处（A 的数组 + B 的归属），迟早对不上；数组里的 uuid
--     还没有外键约束，删了人就留一堆悬空 id。
-- 存在 B 这一行上，两个方向都是索引命中，而且「一人只有一个介绍人」这条
-- 由单列天然保证，数组表达不了。
--
-- 「A 介绍了哪些人」= `where referred_by = A`，算出来的，不存。
alter table customers add column referred_by uuid references customers(id) on delete set null;

-- 自己介绍自己拦在库层面。更长的环（A→B→A）check 约束表达不了，
-- 写入时在 lib/referral.ts 的 referralBlockReason() 里查一层。
alter table customers
  add constraint customers_no_self_referral
  check (referred_by is null or referred_by <> id);

create index on customers (referred_by);

-- 建立关系那一刻的比例快照（0.1 = 10%）。留空 = 跟随全局默认
-- （app_settings 的 referral_rate_default）。
--
-- 为什么要快照：不存的话，哪天把全局默认从 10% 改成 5%，所有历史返点金额
-- 一起跳 —— 已经跟人谈好的比例不该被一个设置项改掉。
alter table customers
  add column referral_rate numeric(5, 4)
  check (referral_rate is null or (referral_rate >= 0 and referral_rate <= 1));

-- 返点**付款**记录。
--
-- 注意这张表存的不是「该返多少」—— 那个是算出来的（订单金额 × 比例），
-- 跟 order_assignments 里「真的配上了」对应 matches 里「想配」是一个道理：
-- 该返多少随订单金额走（总览上拖一下天数就会重算），存成字段迟早对不上；
-- 但**钱真付出去了那是事实**，必须落一行。
--
-- 为什么不复用 payments：那张表 `order_id not null` 且整个 lib/revenue.ts 的
-- 流水口径建在它和 orders 上，掺进反向的钱会把流水搅浑。
create table referral_payouts (
  id uuid primary key default gen_random_uuid(),
  -- 拿返点的人（介绍人）
  referrer_id uuid not null references customers(id) on delete cascade,
  -- 这笔返点是因为哪一单产生的
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null,
  method text check (method in (
    'zelle', 'venmo', 'cash', 'zhifubao', 'chat', 'payid', 'emt'
  )),
  note text,
  created_at timestamptz not null default now(),
  -- 一单对一个介绍人只返一次。防重复登记，也让「这单付过没有」是个确定的问题
  unique (order_id, referrer_id)
);
create index on referral_payouts (referrer_id);
create index on referral_payouts (order_id);
