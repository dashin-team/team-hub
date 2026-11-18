-- 客戶分級 A/B/C/D。可空。不改權限。
-- 請自己在 SQL Editor 執行，這次沒有套到正式資料庫。

alter table public.customers
  add column if not exists grade text;

alter table public.customers
  drop constraint if exists customers_grade_chk;

alter table public.customers
  add constraint customers_grade_chk check (grade is null or grade in ('A', 'B', 'C', 'D'));

comment on column public.customers.grade is '客戶分級 A/B/C/D。A、B 是專業信任，C、D 是社交信任。';
