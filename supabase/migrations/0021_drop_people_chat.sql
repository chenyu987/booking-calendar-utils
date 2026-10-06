-- 删掉 people 上旧的 chat 列。它的内容在 0020 已经搬进 chat_name / chat_id。
--
-- 跟 0020 分成两条，是为了不停机：0020 只加列搬数据，旧代码（还在读 chat）照常能跑；
-- 读 chat_name 的代码上线之后再跑这一条。**顺序不能反** —— 代码没上线就删，
-- 旧代码查 chat 会整条查询失败，返点、匹配台那几页直接挂掉。

-- 0020 跑完到新代码上线之间，旧代码建的人只写了 first_name / chat，chat_name 是空的。
-- 删列之前按 0020 同一个规则再补一遍，不然这几个人在后台就没有昵称了
update people
set chat_name = coalesce(nullif(trim(concat_ws(' ', trim(first_name), trim(last_name))), ''), nullif(trim(chat), ''))
where chat_name is null;

update people
set chat_id = trim(chat)
where chat_id is null
  and nullif(trim(chat), '') is not null
  and nullif(trim(first_name), '') is not null
  and lower(trim(chat)) <> lower(trim(first_name));

alter table people drop column chat;
