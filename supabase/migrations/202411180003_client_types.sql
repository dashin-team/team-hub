-- 客戶類型。可多選，空陣列代表未選。不改權限。
-- 請自己在 SQL Editor 執行，這次沒有套到正式資料庫。

alter table public.customers
  add column if not exists client_types text[] not null default '{}';

alter table public.customers
  drop constraint if exists customers_client_types_chk;

alter table public.customers
  add constraint customers_client_types_chk check (
    client_types <@ array[
      '🏃人壽險客戶',
      '📈投資型客戶',
      '🛵機車險客戶',
      '🚗汽車險客戶',
      '✈️旅平險客戶',
      '💳信用卡客戶',
      '🏭團險客戶',
      '📓產險健康險客戶'
    ]::text[]
  );

comment on column public.customers.client_types is '客戶類型，可多選。值必須是畫面上的八種之一。';
