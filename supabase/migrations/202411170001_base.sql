-- 南恩團隊 TEAM HUB 基礎資料表
-- 在全新的 Supabase 專案 SQL Editor 執行這份，成功後再執行下一份社群遷移。
-- 不存放身分證字號、完整生日、病歷、理賠文件、銀行帳戶、信用卡或完整保單號碼。
-- service_role 只能留在伺服器端，不可放進網頁。

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('admin', 'manager', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'reminder_kind') then
    create type public.reminder_kind as enum ('birthday', 'policy_expiry', 'renewal', 'follow_up', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'reminder_status') then
    create type public.reminder_status as enum ('open', 'done', 'cancelled');
  end if;
end $$;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint teams_name_len check (char_length(btrim(name)) between 1 and 80)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  display_name text not null,
  email text not null,
  role public.member_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_len check (char_length(btrim(display_name)) between 1 and 80),
  constraint profiles_email_len check (char_length(email) between 3 and 200)
);

create index profiles_team_role_idx on public.profiles (team_id, role);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  owner_id uuid not null references public.profiles (id),
  ref_code text,
  display_name text not null,
  phone text,
  email text,
  preferred_contact text,
  service_tags text[] not null default '{}',
  birthday_md text,
  notes text,
  privacy_notice_recorded_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_name_len check (char_length(btrim(display_name)) between 1 and 80),
  constraint customers_birthday_md_chk check (
    birthday_md is null
    or birthday_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  ),
  constraint customers_ref_unique unique (team_id, ref_code)
);

create index customers_owner_idx on public.customers (owner_id, created_at desc);
create index customers_team_idx on public.customers (team_id);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  policy_category text not null,
  insurer_name text,
  effective_date date,
  expiry_date date,
  renewal_reminder_date date,
  status text not null default 'active',
  reference_last4 text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policies_category_len check (char_length(btrim(policy_category)) between 1 and 80),
  constraint policies_last4_chk check (reference_last4 is null or reference_last4 ~ '^[0-9]{4}$'),
  constraint policies_status_chk check (status in ('active', 'expired', 'lapsed'))
);

create index policies_customer_idx on public.policies (customer_id);
create index policies_expiry_idx on public.policies (expiry_date) where status = 'active';

create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  service_date timestamptz not null default now(),
  service_type text not null,
  summary text not null,
  next_action text,
  next_contact_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_records_summary_len check (char_length(summary) between 1 and 4000)
);

create index service_records_customer_date_idx on public.service_records (customer_id, service_date desc);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  owner_id uuid not null references public.profiles (id),
  customer_id uuid references public.customers (id) on delete cascade,
  policy_id uuid references public.policies (id) on delete cascade,
  kind public.reminder_kind not null,
  title text not null,
  due_at timestamptz not null,
  status public.reminder_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_title_len check (char_length(btrim(title)) between 1 and 120)
);

create index reminders_owner_due_idx on public.reminders (owner_id, due_at) where status = 'open';
create index reminders_customer_idx on public.reminders (customer_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  owner_id uuid not null references public.profiles (id),
  title text not null,
  due_date date,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_title_len check (char_length(btrim(title)) between 1 and 200)
);

create index tasks_owner_due_idx on public.tasks (owner_id, due_date);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  title text not null,
  category text,
  prompt text not null,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tools_title_len check (char_length(btrim(title)) between 1 and 80),
  constraint tools_prompt_len check (char_length(prompt) between 1 and 8000)
);

create index tools_team_idx on public.tools (team_id, is_published);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  title text not null,
  category text not null,
  description text,
  storage_path text,
  external_url text,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_one_location check (num_nonnulls(storage_path, external_url) <= 1),
  constraint assets_url_https check (external_url is null or external_url ~* '^https://')
);

create index assets_team_idx on public.assets (team_id, category);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  title text not null,
  description text,
  content_url text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_url_https check (content_url is null or content_url ~* '^https://')
);

create index courses_team_idx on public.courses (team_id, sort_order);

create table public.course_progress (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, member_id)
);

create index course_progress_member_idx on public.course_progress (member_id);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  title text not null,
  body text not null,
  published_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_body_len check (char_length(body) between 1 and 8000)
);

create index announcements_team_idx on public.announcements (team_id, published_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger trg_policies_updated_at before update on public.policies
for each row execute function public.set_updated_at();
create trigger trg_service_records_updated_at before update on public.service_records
for each row execute function public.set_updated_at();
create trigger trg_reminders_updated_at before update on public.reminders
for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger trg_tools_updated_at before update on public.tools
for each row execute function public.set_updated_at();
create trigger trg_assets_updated_at before update on public.assets
for each row execute function public.set_updated_at();
create trigger trg_courses_updated_at before update on public.courses
for each row execute function public.set_updated_at();
create trigger trg_course_progress_updated_at before update on public.course_progress
for each row execute function public.set_updated_at();
create trigger trg_announcements_updated_at before update on public.announcements
for each row execute function public.set_updated_at();

-- 由登入者自己的 profile 讀團隊與角色。security definer 可避免 RLS 互相呼叫。
create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.current_member_role()
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.is_team_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_member_role() in ('admin', 'manager'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_member_role() = 'admin', false)
$$;

-- 登入者不能自己改角色、團隊或啟用狀態。SQL Editor 與 service_role 仍可調整。
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.role is distinct from old.role
       or new.team_id is distinct from old.team_id
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
    then
      raise exception '角色、團隊與啟用狀態只能由管理員透過後台變更';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger protect_profile_privileges_trg
before update on public.profiles
for each row execute function public.protect_profile_privileges();

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.policies enable row level security;
alter table public.service_records enable row level security;
alter table public.reminders enable row level security;
alter table public.tasks enable row level security;
alter table public.tools enable row level security;
alter table public.assets enable row level security;
alter table public.courses enable row level security;
alter table public.course_progress enable row level security;
alter table public.announcements enable row level security;

create policy teams_read_same_team on public.teams
for select to authenticated
using (id = public.current_team_id());

create policy profiles_read_self_or_managers on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (team_id = public.current_team_id() and public.is_team_manager())
);

create policy profiles_update_self_display on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and team_id = public.current_team_id());

create policy customers_read_owner_or_manager on public.customers
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy customers_insert_owner_or_manager on public.customers
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id
      and p.team_id = public.current_team_id()
      and p.is_active = true
  )
);

create policy customers_update_owner_or_manager on public.customers
for update to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
)
with check (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.team_id = public.current_team_id()
  )
);

create policy customers_delete_admin on public.customers
for delete to authenticated
using (team_id = public.current_team_id() and public.is_admin());

create policy policies_read_owner_or_manager on public.policies
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy policies_insert_owner_aligned on public.policies
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and (c.owner_id = auth.uid() or public.is_team_manager())
  )
);

create policy policies_update_owner_or_manager on public.policies
for update to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
)
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and (c.owner_id = auth.uid() or public.is_team_manager())
  )
);

create policy policies_delete_owner_or_manager on public.policies
for delete to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy service_records_read_owner_or_manager on public.service_records
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy service_records_insert_owner_aligned on public.service_records
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and (c.owner_id = auth.uid() or public.is_team_manager())
  )
);

create policy service_records_update_owner_or_manager on public.service_records
for update to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
)
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
  )
);

create policy service_records_delete_owner_or_manager on public.service_records
for delete to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

-- 提醒與任務：本人可維護。管理員可協助同團隊的紀錄。主管預設不瀏覽別人的個人待辦。
create policy reminders_owner_all on public.reminders
for all to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and (
    customer_id is null
    or exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.owner_id = auth.uid()
        and c.team_id = public.current_team_id()
    )
  )
);

create policy reminders_admin_select on public.reminders
for select to authenticated
using (team_id = public.current_team_id() and public.is_admin());

create policy reminders_admin_insert on public.reminders
for insert to authenticated
with check (
  public.is_admin()
  and team_id = public.current_team_id()
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.team_id = public.current_team_id()
  )
);

create policy reminders_admin_update on public.reminders
for update to authenticated
using (team_id = public.current_team_id() and public.is_admin())
with check (
  public.is_admin()
  and team_id = public.current_team_id()
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.team_id = public.current_team_id()
  )
);

create policy tasks_owner_all on public.tasks
for all to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy tasks_admin_select on public.tasks
for select to authenticated
using (team_id = public.current_team_id() and public.is_admin());

create policy tasks_admin_update on public.tasks
for update to authenticated
using (team_id = public.current_team_id() and public.is_admin())
with check (
  public.is_admin()
  and team_id = public.current_team_id()
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.team_id = public.current_team_id()
  )
);

create policy tools_read_published on public.tools
for select to authenticated
using (team_id = public.current_team_id() and is_published = true);

create policy tools_manager_manage on public.tools
for all to authenticated
using (team_id = public.current_team_id() and public.is_team_manager())
with check (team_id = public.current_team_id() and public.is_team_manager());

create policy assets_read_published on public.assets
for select to authenticated
using (team_id = public.current_team_id() and is_published = true);

create policy assets_manager_manage on public.assets
for all to authenticated
using (team_id = public.current_team_id() and public.is_team_manager())
with check (team_id = public.current_team_id() and public.is_team_manager());

create policy courses_read_published on public.courses
for select to authenticated
using (team_id = public.current_team_id() and is_published = true);

create policy courses_manager_manage on public.courses
for all to authenticated
using (team_id = public.current_team_id() and public.is_team_manager())
with check (team_id = public.current_team_id() and public.is_team_manager());

create policy course_progress_read_self_or_manager on public.course_progress
for select to authenticated
using (
  member_id = auth.uid()
  or (
    public.is_team_manager()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.team_id = public.current_team_id()
    )
  )
);

create policy course_progress_self_manage on public.course_progress
for all to authenticated
using (member_id = auth.uid())
with check (
  member_id = auth.uid()
  and exists (
    select 1 from public.courses c
    where c.id = course_id
      and c.team_id = public.current_team_id()
      and c.is_published = true
  )
);

create policy announcements_read_published on public.announcements
for select to authenticated
using (team_id = public.current_team_id() and published_at is not null);

create policy announcements_manager_manage on public.announcements
for all to authenticated
using (team_id = public.current_team_id() and public.is_team_manager())
with check (team_id = public.current_team_id() and public.is_team_manager());

revoke all on table
  public.teams,
  public.profiles,
  public.customers,
  public.policies,
  public.service_records,
  public.reminders,
  public.tasks,
  public.tools,
  public.assets,
  public.courses,
  public.course_progress,
  public.announcements
from anon;

grant select, insert, update, delete on table
  public.teams,
  public.profiles,
  public.customers,
  public.policies,
  public.service_records,
  public.reminders,
  public.tasks,
  public.tools,
  public.assets,
  public.courses,
  public.course_progress,
  public.announcements
to authenticated;

grant all on table
  public.teams,
  public.profiles,
  public.customers,
  public.policies,
  public.service_records,
  public.reminders,
  public.tasks,
  public.tools,
  public.assets,
  public.courses,
  public.course_progress,
  public.announcements
to service_role;

revoke all on function public.current_team_id() from public, anon;
revoke all on function public.current_member_role() from public, anon;
revoke all on function public.is_team_manager() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.protect_profile_privileges() from public, anon;

grant execute on function public.current_team_id() to authenticated, service_role;
grant execute on function public.current_member_role() to authenticated, service_role;
grant execute on function public.is_team_manager() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.protect_profile_privileges() to authenticated, service_role;

comment on table public.customers is '客戶最少必要資料。不存身分證、完整生日、病歷或完整保單號碼。';
comment on column public.customers.birthday_md is '只有月日（MM-DD），用來做生日提醒，不含出生年。';
comment on column public.policies.reference_last4 is '僅供辨識的末四碼，不是完整保單號碼。';
comment on table public.profiles is '角色與團隊只能由 service_role 或 SQL Editor 變更，不能由使用者自己改。';
