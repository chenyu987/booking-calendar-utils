-- 日历日期条上的「这一天的备注」。
-- 跟订单无关的、属于某一天本身的事：这天场地关门、这天涨价、这天有人来取资源……
-- 以前只能记在脑子里或者外面的表格里。
--
-- 用日期本身当主键，不另起 id：一天只有一条，天然唯一，upsert 也不用先查。
create table day_notes (
  day date primary key,
  note text not null,
  updated_at timestamptz not null default now()
);
