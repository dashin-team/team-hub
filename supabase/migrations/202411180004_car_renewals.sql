-- 車險續保只屬於建立它的夥伴。主管也不能看別人的列。
-- 請自己在 Supabase SQL Editor 執行。這份不會自動套到正式資料庫。

create table if not exists public.car_renewals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  plate text not null,
  car_type text,
  ct_date date,
  vo_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint car_renewals_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint car_renewals_plate_len check (char_length(btrim(plate)) between 1 and 20),
  constraint car_renewals_type_len check (car_type is null or char_length(car_type) <= 40),
  constraint car_renewals_note_len check (note is null or char_length(note) <= 2000),
  constraint car_renewals_one_date_chk check (ct_date is not null or vo_date is not null)
);

create index if not exists car_renewals_owner_idx on public.car_renewals (owner_id, ct_date);

drop trigger if exists trg_car_renewals_updated_at on public.car_renewals;
create trigger trg_car_renewals_updated_at
before update on public.car_renewals
for each row execute function public.set_updated_at();

alter table public.car_renewals enable row level security;

drop policy if exists car_renewals_select_owner on public.car_renewals;
create policy car_renewals_select_owner on public.car_renewals
for select to authenticated
using (owner_id = auth.uid());

drop policy if exists car_renewals_insert_owner on public.car_renewals;
create policy car_renewals_insert_owner on public.car_renewals
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists car_renewals_update_owner on public.car_renewals;
create policy car_renewals_update_owner on public.car_renewals
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists car_renewals_delete_owner on public.car_renewals;
create policy car_renewals_delete_owner on public.car_renewals
for delete to authenticated
using (owner_id = auth.uid());

revoke all on table public.car_renewals from anon;
grant select, insert, update, delete on table public.car_renewals to authenticated;
grant all on table public.car_renewals to service_role;
