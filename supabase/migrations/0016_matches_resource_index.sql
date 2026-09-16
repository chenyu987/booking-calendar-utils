-- 补上 matches (resource_id) 这个索引。
--
--
-- 用 `if not exists` + 显式名字 `matches_resource_id_idx`：这正是 0001 里那句匿名
-- `create index on matches (resource_id)` 让 Postgres 自动起的名字，所以这条迁移
-- 对 prod 跑是干净的空转，对 test 跑才真的建。
--
-- 按谁查它：物主看「我这个资源有哪些意向」、匹配台按资源列意向，都是 where resource_id = ?。

create index if not exists matches_resource_id_idx on public.matches (resource_id);
