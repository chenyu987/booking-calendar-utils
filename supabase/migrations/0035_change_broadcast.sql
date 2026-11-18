-- 实时更新（2026-11-18）：库里一改，开着排期总览的管理员一两秒内就看到，不用刷新。
--
-- 挂在 change_log 上（0025）：14 张业务表的改动本来就都由 trigger 记进这张表，
-- 从哪个入口改的都跑不掉（另一个管理员、物主自己提意向、直接改库），这里再接一个 trigger 就全有了。
--
-- **广播里只放 id，不放内容**：表名、主键、动作、对应哪一单。浏览器收到后去我们自己的服务端
-- 拉那几行（app/admin/overview/rows，middleware 拦着要登录）。客人名字电话这些不过 Realtime。
-- 频道是私有的（private = true）：只有 app_metadata 里带 admin_id 的登录账号（管理员）能订阅，
-- 策略写在 realtime.messages 上。
--
-- 发不出去不能让写库失败：整段包在 exception 里，出错只是这一条没通知（浏览器那边有兜底：
-- 断线重连、切回标签页都会整页重拉）。

create or replace function broadcast_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      't', new.table_name,
      'row', new.row_id,
      'op', new.op,
      'order', coalesce(new.new_row ->> 'order_id', new.old_row ->> 'order_id')
    ),
    'change',
    'admin-changes',
    true
  );
  return null;
exception when others then
  return null;
end;
$$;

-- Supabase 新建函数默认给 anon / authenticated EXECUTE，光 revoke public 不够（0027 那条规矩）
revoke execute on function broadcast_change() from public, anon, authenticated;

drop trigger if exists broadcast_change on change_log;
create trigger broadcast_change after insert on change_log
  for each row execute function broadcast_change();

-- 谁能收：登录了、而且是管理员（app_metadata.admin_id，跟 middleware 认管理员是同一个依据）
drop policy if exists "admins receive changes" on realtime.messages;
create policy "admins receive changes" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() = 'admin-changes'
    and (auth.jwt() -> 'app_metadata' ->> 'admin_id') is not null
  );
