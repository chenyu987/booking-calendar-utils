-- Beta 资源分档（2026-11-13）：Beta Base 和 Beta Full 能去的地点、有没有黑名单日不一样，后台要分开筛。
--
-- 不改 item_type（还是只有 beta / alpha）：地点和类型对不对得上（lib/locations.ts 的 itemFits）、
-- 分配校验、排期总览的类型开关……二十多处读它，只认「哪一边」。分档是多出来的一层信息，单放一列。
-- 空着 = 还不知道是哪档（beta unknown）。只有 beta 资源有档，alpha 资源这一列必须空着。
alter table resources add column if not exists item_tier text
  check (item_tier in ('base', 'full'));
alter table resources add constraint resources_pass_tier_beta_only
  check (item_tier is null or item_type = 'beta');
