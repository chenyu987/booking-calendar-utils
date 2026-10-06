-- 管理员，以及「这个客人是哪个管理员加的」。
--
-- 每个管理员对应一个加客人用的账号（Admin1 = 私人号，admin2 = 工作号，以后还有别的员工）。
-- 所以「哪个号加的」和「哪个管理员的客人」是同一件事，只记一层（2026-10-06 定的）。
--
-- **管理员是一张表，不是写死的几个值**：加员工是在设置里点一下，不是改代码发版。
-- 以后接 admin 登录（CLAUDE.md「上线前必须做」第 1 条），在这张表上加 auth_user_id。
--
-- **「两个管理员都加了」= person_contacts 里两行，不存 both**（能算出来的不存）。
-- 挂在**人**（people）上，不是客户上 —— 物主也是聊天联系的。
create table admins (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 列表按 created_at 排。同一条语句插的两行时间戳完全一样，谁在前就没准了 ——
-- admin2 晚一秒，Admin1 固定在前
insert into admins (name, created_at) values
  ('Admin1', now()),
  ('admin2', now() + interval '1 second');

create table person_contacts (
  person_id uuid not null references people(id) on delete cascade,
  -- restrict：还有客人挂在这个管理员名下就不让删。删了的话「谁的客人」整列静悄悄地没了
  admin_id uuid not null references admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (person_id, admin_id)
);
-- 「这个管理员加了哪些人」那个方向（按管理员筛）。另一个方向主键已经覆盖了
create index on person_contacts (admin_id);
