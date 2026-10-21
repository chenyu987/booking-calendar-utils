-- 给 people 加地址（2026-10-21）。
--
-- 以后要按城市 / 邮编拿出来用（客人从哪儿来、哪片人多），客户 / 物主有了自己的页面也能自己填。
-- 放 people 不放身份表：地址是人的，跟他是客户还是物主无关 —— 跟电话、邮箱一个道理。
--
--
-- 只有 country 有约束：ISO 3166 两位大写（US / CA / AU …）。客人分布在A 区和B 区，
-- 不约束的话「USA」「美国」「us」会算成几个国家 —— 跟当初 locaj / akaad 算成两个地点是同一个坑。
-- region（州 / 省）和 postal_code 不约束格式：三个国家写法各不一样（加拿大邮编带空格、
-- 美国邮编有前导 0，所以是 text 不是数字），宁可漏拦也不能错拦。
alter table people
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column region text,
  add column postal_code text,
  add column country text check (country ~ '^[A-Z]{2}$');
