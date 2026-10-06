-- 昵称 / 账号分开，first_name 退回「注册用户自己填的称呼」（2026-10-06 定的）。
--
-- 原来的 `chat` 一列装着两种东西：导入的数据里是**昵称**（1904 / 1955 人跟 first_name
-- 一模一样 —— 导入时同一个名字填进了两列），少数几个（多是测试号）装的是**账号**
-- （lynnyyyy、xiaoming_wx…，那几个人的名字在 first_name 上）。
--
--   chat_name：昵称 —— 后台认人、显示用的就是它（排期总览色块上那个名字）
--   chat_id：账号 —— 选填，想加再加
--   first_name / last_name：留给以后注册的用户自己填，不必填，后台不再拿它显示
--
-- 列的物理顺序改不了（Postgres 只能整表重建，people 被好几张表外键指着，不值得）。
-- 「昵称放在最前面」在界面上做：表单、列表里它都排第一。

alter table people add column chat_name text;
alter table people add column chat_id text;

-- 昵称：拿现在显示的那个名字（名 + 姓，跟原来后台拼的一样）。都空着的才用原来 chat 列补 ——
-- 这样搬完 overview 上每个人显示的名字一个都不变
update people set chat_name = coalesce(nullif(trim(concat_ws(' ', trim(first_name), trim(last_name))), ''), nullif(trim(chat), ''));

-- 账号：只有 chat 跟 first_name 不一样的那几个，chat 里装的才是账号。
-- 一样的那些 chat 装的就是昵称，不是号，不搬
update people
set chat_id = trim(chat)
where nullif(trim(chat), '') is not null
  and nullif(trim(first_name), '') is not null
  and lower(trim(chat)) <> lower(trim(first_name));

-- **旧的 chat 列这里不删**，删在 0021：先加列搬数据（新旧代码都能跑），
-- 等读 chat_name 的代码上线了再删旧列 —— 中间不用停机
