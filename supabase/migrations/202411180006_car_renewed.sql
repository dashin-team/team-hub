-- 車險各險種可分別標記已續保。不改既有列資料。
-- 這份請自行套用，還沒執行到正式資料庫。

alter table public.car_renewals
  add column if not exists ct_renewed_at timestamptz,
  add column if not exists ct_prev_date date,
  add column if not exists vo_renewed_at timestamptz,
  add column if not exists vo_prev_date date;

comment on column public.car_renewals.ct_renewed_at is '強制險標記已續保的時間。剩餘天數大於 90 天時顯示已續保，之後恢復一般狀態。';
comment on column public.car_renewals.ct_prev_date is '強制險續保前的到期日，取消續保時還原。';
comment on column public.car_renewals.vo_renewed_at is '任意險標記已續保的時間。剩餘天數大於 90 天時顯示已續保，之後恢復一般狀態。';
comment on column public.car_renewals.vo_prev_date is '任意險續保前的到期日，取消續保時還原。';
