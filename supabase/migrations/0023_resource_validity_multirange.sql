-- 资源有效期：一对 date_range_start / date_range_end → 一列 validity datemultirange（2026-10-10）。
--
-- 为什么：一个资源可能 24/25 季能用、25/26 季没续、26/27 又续上了。一对起止只能表达
-- 「从哪天到哪天」，中间那季空着表达不了。datemultirange 就是「一组区间」：
--   · 库会自己排序、把挨着 / 重叠的段合成一段，存不进乱数据
--   · 每段两头照样可以不设限（`(,)`），「留空 = 这一头不设限」的老约定原样保留
--   · 比拆一张子表好：一个资源的有效期还是一个值，读写一条语句，不用两步写、不用 join
-- 读写和解析在 lib/validity.ts。
--
-- 跟 0020 / 0021 一样分两条不停机：这一条只加列搬数据，旧代码照常读写那两列；
-- 读 validity 的代码上线之后再跑 0024 删旧列。

alter table resources add column validity datemultirange not null default '{(,)}';

-- 搬数据：一对起止 → 一段，两头含当天。空的那头 daterange 自己就当不设限
update resources set validity = datemultirange(daterange(date_range_start, date_range_end, '[]'));

-- 不许是空集合：「哪天都不能用」的资源该改挂牌状态（暂停 / 下架），不该靠有效期表达
alter table resources add constraint resources_validity_not_empty check (not isempty(validity));

-- 0023 跑完到新代码上线之间，旧代码还在写那两列。这个触发器把它们同步到 validity，
-- 0024 删列时一起删掉。新代码不碰那两列：insert 时两列都是 null 就不动 validity，
-- update 没提到那两列就不触发
create function resources_sync_validity() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' or new.date_range_start is not null or new.date_range_end is not null then
    new.validity := datemultirange(daterange(new.date_range_start, new.date_range_end, '[]'));
  end if;
  return new;
end $$;

create trigger resources_sync_validity
  before insert or update of date_range_start, date_range_end on resources
  for each row execute function resources_sync_validity();
