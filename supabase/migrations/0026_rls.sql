-- 打开 RLS（0026）：浏览器里那把 anon key 从此什么数据都读不到、写不了，只剩登录用。
--
-- anon key 是打包进网页发给浏览器的，谁都能从 F12 里抄走。RLS 全关的时候，拿着它绕过页面
-- 直接打 PostgREST，能读写所有表 —— admin 页面加了登录也挡不住这条路。
--
-- **一条策略都不写，就是全拒。** 应用的所有读写都在服务端，走 service key（lib/supabase.ts），
-- service key 不受 RLS 管。谁能看什么由服务端代码决定：/admin 由 middleware 拦登录
-- （lib/adminAuth.ts），客户 / 物主页面按登录的人过滤。
-- 浏览器里没有一处直接查库，所以不需要给 anon / authenticated 写「能看哪几行」的策略。
--
-- **新建表要记得在这儿加一行**（0001 末尾那一串照抄）——
-- 漏了的话那张表对 anon key 是敞开的。tests/rls.test.ts 拿 0001 对，漏了会红。

alter table people enable row level security;
alter table admins enable row level security;
alter table person_contacts enable row level security;
alter table customers enable row level security;
alter table providers enable row level security;
alter table resources enable row level security;
alter table orders enable row level security;
alter table order_assignments enable row level security;
alter table order_notes enable row level security;
alter table payments enable row level security;
alter table referral_payouts enable row level security;
alter table matches enable row level security;
alter table day_notes enable row level security;
alter table app_settings enable row level security;
alter table change_log enable row level security;

-- 改动记录里「谁」：客户 / 物主自己改的，原来靠 auth.uid()（他们的请求带着登录 token）。
-- 现在服务端统一用 service key 写，auth.uid() 永远是空的 —— 改成读服务端转过来的
-- `x-auth-uid` 请求头（middleware 验完登录 token 写的，lib/supabase.ts 转给 PostgREST）。
-- 库只有服务端连得上了，这个头和 x-admin-id 一样伪造不了。
-- auth.uid() 留着排第一：哪天真有带登录 token 直连的请求，它还是最可信的那个。
create or replace function log_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  key text;
  hdrs jsonb;
  header text;
  uid_header text;
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
  hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  header := hdrs ->> 'x-admin-id';
  select id into actor from admins where id::text = header;
  -- 不是 uuid 的当没有：一个坏头不该让写库失败
  uid_header := hdrs ->> 'x-auth-uid';
  if uid_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    uid_header := null;
  end if;

  insert into change_log (table_name, row_id, op, old_row, new_row, admin_id, auth_user_id)
  values (tg_table_name, key, lower(tg_op), old_j, new_j, actor,
          coalesce(auth.uid(), uid_header::uuid));
  return null;
end;
$$;
