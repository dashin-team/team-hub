-- 行事曆改成開始／結束時間。在 202411170004 之後執行一次。
-- 不刪除原本的 event_date、event_time，舊資料會回填到新欄位。

alter table public.calendar_events
  add column all_day boolean not null default false,
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column companion_id uuid references public.profiles (id) on delete set null,
  add column reminder text;

update public.calendar_events
set
  all_day = event_time is null,
  starts_at = case
    when event_time is null then (event_date::timestamp at time zone 'Asia/Taipei')
    else ((event_date + event_time)::timestamp at time zone 'Asia/Taipei')
  end,
  ends_at = case
    when event_time is null then ((event_date + 1)::timestamp at time zone 'Asia/Taipei')
    else ((event_date + event_time)::timestamp at time zone 'Asia/Taipei') + interval '30 minutes'
  end,
  reminder = coalesce(reminder, 'none');

alter table public.calendar_events
  alter column starts_at set not null,
  alter column ends_at set not null;

alter table public.calendar_events
  add constraint calendar_events_span_chk check (ends_at > starts_at),
  add constraint calendar_events_reminder_chk check (
    reminder is null or reminder in ('none', 'ontime', '15m', '30m', '1h', '1d')
  );

create index calendar_events_owner_start_idx on public.calendar_events (owner_id, starts_at);

create or replace function public.team_directory()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.team_id = public.current_team_id()
    and p.is_active
  order by p.display_name
$$;

revoke all on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated, service_role;

comment on column public.calendar_events.starts_at is '活動開始。全日從當地 00:00 起。';
comment on column public.calendar_events.ends_at is '活動結束，必須晚於開始。';
comment on column public.calendar_events.companion_id is '陪同的同團隊夥伴，可空白。';
comment on column public.calendar_events.reminder is '只記錄提醒選項，這一版不會推播。';
comment on function public.team_directory() is '同團隊夥伴姓名，給行事曆陪同選單。不含信箱。';
