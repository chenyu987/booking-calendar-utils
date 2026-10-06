-- 清空 people.first_name / last_name 的内容，**列留着**备用（2026-10-06 定的）。
--
-- 0020 之后后台认人、显示一律用 chat_name，这两列没人看了；而导入的数据里它们跟
-- chat_name 是同一个名字（一人存两份，改了一边另一边就过时 —— CLAUDE.md 那条老问题）。
-- 清空前核对过：每个人的名和姓都已经包含在他的 chat_name 里，清掉不丢信息；
-- 按 displayName 的规则算，清空后显示名字会变的人是 0。
--
-- 列留着：客户 / 物主自己页面上的「称呼」照旧写 first_name —— 以后他们自己填的称呼存在这儿。
update people set first_name = null, last_name = null
where first_name is not null or last_name is not null;
