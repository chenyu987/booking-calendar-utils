-- 有效期改成选填：两头各自可空，空 = 这一头不设限。
--
-- 为什么：整季通用的资源本来就没有起止，物主说不出准确日期。逼他填一个只有两种
-- 结果 —— 要么瞎填，那是假数据，会在分配那一刻把一张合法的资源拦掉；要么他干脆
-- 不挂了。留空至少是诚实的：界面上显示「不限」，管理员一眼看到这一头没人核实过。
--
-- 配套的判断在 lib/resourceStatus.ts：coversOrder 跳过留空的那一头，
-- isExpired 对没有结束日的资源永远返回 false。
alter table resources alter column date_range_start drop not null;
alter table resources alter column date_range_end drop not null;
