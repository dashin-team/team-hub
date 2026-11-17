-- 客戶策略分析圖。
-- 在已經跑過 202411170003 的專案執行一次。
-- 請由負責人在 Supabase SQL Editor 執行。不要從網站或這支程式連上正式資料庫。
-- 五項度仍是各自的文字欄。這張圖另外放在 strategy_grid。

alter table public.customers
  add column strategy_grid jsonb not null default '{}'::jsonb;

alter table public.customers
  add constraint customers_strategy_grid_obj check (jsonb_typeof(strategy_grid) = 'object');

comment on column public.customers.strategy_grid is '客戶策略分析圖：need、decision、resource、compete、goal。自由筆記，不要貼個資文件。';
