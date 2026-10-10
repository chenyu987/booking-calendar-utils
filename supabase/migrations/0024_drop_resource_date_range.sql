-- 删掉 resources 上旧的 date_range_start / date_range_end。内容在 0023 已经搬进 validity。
--
-- **读 validity 的代码上线之后再跑。** 顺序不能反 —— 代码没上线就删，旧代码查这两列
-- 会整条查询失败，排期总览、物主页直接挂掉。0023 到这儿之间旧代码写的改动，
-- 0023 的触发器已经同步进 validity 了。

drop trigger resources_sync_validity on resources;
drop function resources_sync_validity();
alter table resources drop column date_range_start;
alter table resources drop column date_range_end;
