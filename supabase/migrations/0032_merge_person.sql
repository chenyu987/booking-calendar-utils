-- 合并两个人（2026-10-25）。
--
-- 客户自己用邮箱登录时，库里多半已经有他了 —— 管理员从聊天上手工录的，只有昵称、没有邮箱，
-- 于是认领（lib/accountClaim.ts）认不出来，另起了一个新人。他在「我的账号」里填了昵称之后，
-- Customer 管理会提示「可能是老客人 XXX」（lib/selfClaim.ts），管理员确认了才调这个函数。
-- **不自动合**：谁都能在自己页面上填别人的昵称，自动合等于让他看到别人的订单和生日。
--
-- keep = 老客人（管理员录的那行，留着），drop = 登录时新建的那行（合完删掉）。
-- 写成一个函数是为了**一个事务**：挪订单、挪资源、挪介绍关系、搬登录账号，中途哪一步失败都整个撤回，
-- 不会留下「订单挪了一半、人还在两处」。PostgREST 一次请求做不到多表事务。
create or replace function merge_person(keep_id uuid, drop_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  k people;
  d people;
begin
  if keep_id = drop_id then
    raise exception '是同一个人，不用合';
  end if;
  select * into k from people where id = keep_id for update;
  select * into d from people where id = drop_id for update;
  if k.id is null or d.id is null then
    raise exception '人不存在（可能刚被合并过）';
  end if;
  -- 一个人只能有一个登录账号（people.auth_user_id unique）。老客人已经绑了别的账号，
  -- 说明他自己登录过了，那这两个不是同一个人，或者得人工看
  if k.auth_user_id is not null then
    raise exception '老客人已经绑了登录账号，不能再合';
  end if;

  -- 身份：新人是客户 / 物主，老客人也得有
  if exists (select 1 from customers where id = drop_id) then
    insert into customers (id) values (keep_id) on conflict do nothing;
  end if;
  if exists (select 1 from providers where id = drop_id) then
    insert into providers (id) values (keep_id) on conflict do nothing;
  end if;

  update orders set customer_id = keep_id where customer_id = drop_id;
  update resources set provider_id = keep_id where provider_id = drop_id;

  -- 介绍关系：别人的介绍人是新人 → 改成老客人
  update customers set referred_by = keep_id
   where referred_by = drop_id and id <> keep_id;
  -- 新人自己有介绍人、老客人没有 → 带过去（老客人有的话以老客人的为准）
  update customers r
     set referred_by = x.referred_by,
         referral_rate = x.referral_rate,
         referral_from = x.referral_from,
         referral_until = x.referral_until
    from customers x
   where r.id = keep_id and x.id = drop_id
     and r.referred_by is null and x.referred_by is not null and x.referred_by <> keep_id;
  -- 付过的返点：一单对一个介绍人只返一次（unique），撞上的那条留在老客人那边的为准
  update referral_payouts p set referrer_id = keep_id
   where p.referrer_id = drop_id
     and not exists (
       select 1 from referral_payouts q where q.referrer_id = keep_id and q.order_id = p.order_id
     );

  insert into person_contacts (person_id, admin_id, created_at)
  select keep_id, admin_id, created_at from person_contacts where person_id = drop_id
  on conflict do nothing;

  -- 登录账号搬过去。先从新人身上摘掉 —— unique，两行不能同时挂着
  update people set auth_user_id = null where id = drop_id;
  -- 资料：老客人已有的不动（管理员录的、认人靠它），空着的拿新人填的补上
  update people set
    auth_user_id = d.auth_user_id,
    chat_name = coalesce(k.chat_name, d.chat_name),
    chat_id = coalesce(k.chat_id, d.chat_id),
    first_name = coalesce(k.first_name, d.first_name),
    last_name = coalesce(k.last_name, d.last_name),
    date_of_birth = coalesce(k.date_of_birth, d.date_of_birth),
    email = coalesce(k.email, d.email),
    phone_number = coalesce(k.phone_number, d.phone_number),
    address_line1 = coalesce(k.address_line1, d.address_line1),
    address_line2 = coalesce(k.address_line2, d.address_line2),
    city = coalesce(k.city, d.city),
    region = coalesce(k.region, d.region),
    postal_code = coalesce(k.postal_code, d.postal_code),
    country = coalesce(k.country, d.country),
    note = coalesce(k.note, d.note)
  where id = keep_id;

  -- 订单、资源、介绍关系都挪走了，剩下的（身份行、没挪成的返点）顺着 cascade 一起删
  delete from people where id = drop_id;
end;
$$;

-- 只给服务端（service key）调。Supabase 新建函数默认给 anon / authenticated EXECUTE（0027 那条）
revoke execute on function merge_person(uuid, uuid) from public, anon, authenticated;
grant execute on function merge_person(uuid, uuid) to service_role;
