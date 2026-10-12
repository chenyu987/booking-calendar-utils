-- 改动记录（0025）：谁、什么时候、改了哪一行、改之前 / 之后是什么。
--
-- **trigger 记，不靠代码记。** 写库的入口有几十处（排期总览的各个 route、各个列表页的
-- server action、物主 / 客户自己的页面），靠每处手写一条日志，漏一处就是一个黑洞，
-- 而且新加入口的人不会知道要写。trigger 挂在表上，从哪儿改的都跑不掉 —— 连 SQL Editor
-- 里手改的也记（那种「谁」是空的）。
--
-- **「谁」从哪来：**
--   - admin：服务端写库时带一个 `x-admin-id` 请求头，值是排期总览上选的当前身份
--     （lib/supabase.ts 的 withAdminHeader）。PostgREST 把请求头放在 `request.headers` 里，
--     这里读出来，**对得上 admins 才记**，对不上当没有 —— 不会因为一个坏头让写库失败
--   - 客户 / 物主自己改的：他们走登录态的 client，`auth.uid()` 就是登录账号
--   - 都没有 = 不知道（没选身份、SQL Editor、导入脚本）
--   请求头是能伪造的，这不是防篡改的审计 —— admin 侧还没有登录（CLAUDE.md「上线前必须做」），
--   接了登录之后「谁」改从登录账号来，这一层不用动
--
-- **整行快照，不存 diff。** 「改了哪几个字段」从 old_row / new_row 现算（lib/changeLog.ts），
-- 能算的不存。删掉的行也就留了一份完整的底，真删错了能照着补回去。
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
