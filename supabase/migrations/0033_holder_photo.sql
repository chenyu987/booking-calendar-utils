-- 持有人照片（2026-11-09）。物品登记了使用人，分配时看一眼长相，比只看名字生日更不容易配错人。
--
-- 照片本身放 Supabase Storage 的私有桶 holder-photos，库里只记路径（<resource_id>/<时间戳>.jpg）。
-- 换照片就换一个新路径：浏览器按网址缓存，路径不变的话换了照片还看到旧的。
-- 桶是**私有**的：这是真人照片，不给公开网址。页面经 /admin/holder-photo 读
-- （middleware 先验管理员登录），见 lib/holderPhoto.ts。
alter table resources add column if not exists holder_photo_path text;

insert into storage.buckets (id, name, public)
values ('holder-photos', 'holder-photos', false)
on conflict (id) do nothing;
