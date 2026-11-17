-- FBFLI 聯絡紀錄。主管可看自己區，新增、修改、刪除只能動自己的列。
-- 這份還沒套到正式資料庫。

create table public.contact_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  owner_id uuid not null references public.profiles (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  log_date date not null,
  actions text[] not null default '{}',
  note text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now(),
  constraint contact_logs_actions_known check (
    actions <@ array['訊息定聯', '貼圖回覆', '回覆限動']::text[]
  ),
  constraint contact_logs_note_len check (char_length(note) <= 4000),
  constraint contact_logs_summary_len check (char_length(summary) <= 2000)
);

create index contact_logs_owner_day_idx on public.contact_logs (owner_id, log_date desc);
create index contact_logs_customer_idx on public.contact_logs (customer_id, log_date desc);

alter table public.contact_logs enable row level security;

drop policy if exists contact_logs_select_owner_or_manager on public.contact_logs;
create policy contact_logs_select_owner_or_manager on public.contact_logs
for select to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists contact_logs_insert_owner on public.contact_logs;
create policy contact_logs_insert_owner on public.contact_logs
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists contact_logs_update_owner on public.contact_logs;
create policy contact_logs_update_owner on public.contact_logs
for update to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
)
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists contact_logs_delete_owner on public.contact_logs;
create policy contact_logs_delete_owner on public.contact_logs
for delete to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);

revoke all on table public.contact_logs from anon;
grant select, insert, update, delete on table public.contact_logs to authenticated;

comment on table public.contact_logs is 'FBFLI 每日聯絡紀錄。note 是原文，summary 是整理後的重點。';
