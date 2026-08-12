-- 给 resources 加持有人信息，并把年龄改成只存生日
--
-- 第一次建表的话跑 0001 就够了，里面已经包含这些改动，不用跑这个文件。
-- 这个文件是给「已经建好表」的情况用的增量迁移。
--
-- 背景：一个 Provider 可能持多个人的资源（比如一批 bundle 资源下面挂着好几个名字），
-- 所以持有人的姓名/性别/生日必须存在 resources 上，而不是 providers 上。
-- 物品登记了使用人，匹配时性别年龄对不上过不了核验。

alter table resources
  add column if not exists holder_name text,
  add column if not exists holder_gender text
    check (holder_gender in ('male', 'female')),
  add column if not exists holder_date_of_birth date;

-- 年龄不再存死数字，改成只存生日、年龄用代码算（见 lib/age.ts）
alter table customers drop column if exists age;
alter table providers drop column if exists age;

-- 资源类型是「资源」的属性不是「人」的属性，resources 上已经有了
alter table providers drop column if exists item_type;
