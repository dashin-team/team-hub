-- 行事曆活動。在 202411170003 之後執行一次。
-- 舊的 tasks 待辦表保留，不在這裡改寫。畫面會把待辦一起排進行事曆。
-- 本人可新增、修改、刪除自己的活動。同團隊的主管與管理員只能讀。

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  owner_id uuid not null references public.profiles (id),
  customer_id uuid references public.customers (id) on delete set null,
  title text not null,
  event_date date not null,
  event_time time,
  event_type text not null,
  note text,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_title_len check (char_length(btrim(title)) between 1 and 200),
  constraint calendar_events_type_chk check (
    event_type in ('visit', 'meet', 'deal', 'recruit', 'train', 'other')
  ),
  constraint calendar_events_note_len check (note is null or char_length(note) <= 4000)
);

create index calendar_events_owner_date_idx on public.calendar_events (owner_id, event_date);
create index calendar_events_team_date_idx on public.calendar_events (team_id, event_date);

create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

create policy calendar_events_select_owner_or_manager on public.calendar_events
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy calendar_events_insert_owner on public.calendar_events
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id
      and p.team_id = public.current_team_id()
      and p.is_active = true
  )
  and (
    customer_id is null
    or exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.team_id = public.current_team_id()
    )
  )
);

create policy calendar_events_update_owner on public.calendar_events
for update to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and (
    customer_id is null
    or exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.team_id = public.current_team_id()
    )
  )
);

create policy calendar_events_delete_owner on public.calendar_events
for delete to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid());

revoke all on table public.calendar_events from public, anon;
grant select, insert, update, delete on table public.calendar_events to authenticated;
grant all on table public.calendar_events to service_role;

comment on table public.calendar_events is '夥伴行事曆。主管與管理員可讀同團隊，只有本人可改。';
