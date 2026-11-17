-- 管理員重設密碼，以及主管只看自己區的客戶。
-- 請在 Supabase SQL Editor 執行一次。不要從網站連上正式資料庫。
-- 執行完後，由負責人自己寫入預設密碼，不要把密碼留在這個檔案：
--   insert into private.app_settings (key, value) values ('default_password', '...');

create schema if not exists extensions;
create schema if not exists private;

do $$
declare
  ext_schema text;
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create extension pgcrypto with schema extensions;
  else
    select n.nspname into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto';
    if ext_schema is distinct from 'extensions' then
      alter extension pgcrypto set schema extensions;
    end if;
  end if;
end $$;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.app_settings (
  key text primary key,
  value text not null
);

revoke all on table private.app_settings from public;
revoke all on table private.app_settings from anon, authenticated;
alter table private.app_settings enable row level security;

create or replace function public.can_view_owner(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles me
    left join public.profiles owner on owner.id = target
    where me.id = auth.uid()
      and me.is_active
      and (
        target = me.id
        or (
          me.role = 'admin'
          and owner.team_id = me.team_id
        )
        or (
          me.role = 'manager'
          and owner.team_id = me.team_id
          and me.zone is not null
          and owner.zone = me.zone
        )
      )
  );
$$;

revoke all on function public.can_view_owner(uuid) from public, anon;
grant execute on function public.can_view_owner(uuid) to authenticated, service_role;

create or replace function public.admin_reset_password(target uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth, private
as $$
declare
  actor public.profiles;
  dest public.profiles;
  secret text;
begin
  if auth.uid() is null then
    raise exception '請先登入';
  end if;

  select * into actor
  from public.profiles
  where id = auth.uid() and is_active;

  if actor.id is null or actor.role is distinct from 'admin' then
    raise exception '只有管理員可以重設密碼';
  end if;

  if target = actor.id then
    raise exception '請用修改密碼來改自己的密碼';
  end if;

  select * into dest
  from public.profiles
  where id = target and team_id = actor.team_id;

  if dest.id is null then
    raise exception '找不到這位夥伴';
  end if;

  select value into secret
  from private.app_settings
  where key = 'default_password';

  if secret is null or char_length(btrim(secret)) < 8 then
    raise exception '還沒設定團隊預設密碼';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(secret, extensions.gen_salt('bf'))
  where id = dest.id;

  if not found then
    raise exception '找不到登入帳號';
  end if;

  perform set_config('app.pw_changed', 'yes', true);
  update public.profiles
  set must_change_password = true
  where id = dest.id;
end;
$$;

revoke all on function public.admin_reset_password(uuid) from public, anon;
grant execute on function public.admin_reset_password(uuid) to authenticated, service_role;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('authenticated', 'anon')
     and coalesce(current_setting('app.admin_member', true), '') is distinct from 'yes'
  then
    if new.role is distinct from old.role
       or new.team_id is distinct from old.team_id
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
       or new.account is distinct from old.account
       or new.zone is distinct from old.zone
       or new.grade is distinct from old.grade
       or new.zone_order is distinct from old.zone_order
       or (
         new.must_change_password is distinct from old.must_change_password
         and coalesce(current_setting('app.pw_changed', true), '') is distinct from 'yes'
       )
    then
      raise exception '角色、團隊、帳號與職級只能由管理員透過後台變更';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.admin_create_member(
  p_display_name text,
  p_account text,
  p_grade text,
  p_zone text,
  p_role public.member_role
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth, private
as $$
declare
  actor public.profiles;
  secret text;
  new_id uuid := gen_random_uuid();
  clean_account text := lower(btrim(coalesce(p_account, '')));
  clean_name text := btrim(coalesce(p_display_name, ''));
  clean_zone text := btrim(coalesce(p_zone, ''));
  clean_grade text := upper(btrim(coalesce(p_grade, '')));
  clean_role public.member_role := p_role;
  login_email text;
  zone_rank integer;
begin
  if auth.uid() is null then
    raise exception '請先登入';
  end if;

  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null or actor.role is distinct from 'admin' then
    raise exception '只有管理員可以新增夥伴';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception '請填姓名';
  end if;
  if clean_account !~ '^[^[:space:]@]{1,40}$' then
    raise exception '帳號請用 1 到 40 個字，不要空白或 @';
  end if;
  if clean_grade not in ('UM', 'SP', 'CA') then
    raise exception '職級請選 UM、SP 或 CA';
  end if;
  if char_length(clean_zone) < 1 or char_length(clean_zone) > 40 then
    raise exception '請填區';
  end if;
  if clean_role is null then
    clean_role := case when clean_grade = 'CA' then 'member'::public.member_role else 'manager'::public.member_role end;
  end if;

  if exists (
    select 1 from public.profiles
    where account is not null and lower(account) = clean_account
  ) then
    raise exception '這個帳號已經有人使用';
  end if;

  login_email := clean_account || '@nanen-team.app';
  if exists (select 1 from auth.users u where lower(u.email::text) = login_email) then
    raise exception '這個帳號已經有人使用';
  end if;

  select value into secret from private.app_settings where key = 'default_password';
  if secret is null or char_length(btrim(secret)) < 8 then
    raise exception '還沒設定團隊預設密碼';
  end if;

  select p.zone_order into zone_rank
  from public.profiles p
  where p.team_id = actor.team_id and p.zone = clean_zone and p.zone_order is not null
  limit 1;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    login_email,
    extensions.crypt(secret, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', clean_name),
    now(),
    now(),
    '', '', '', '', '', '', '', '',
    false,
    false
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_id,
    jsonb_build_object('sub', new_id::text, 'email', login_email, 'email_verified', true),
    'email',
    new_id::text,
    now(),
    now()
  );

  if exists (select 1 from public.profiles where id = new_id) then
    perform set_config('app.admin_member', 'yes', true);
    update public.profiles
    set team_id = actor.team_id,
        display_name = clean_name,
        email = login_email,
        role = clean_role,
        is_active = true,
        account = clean_account,
        zone = clean_zone,
        grade = clean_grade,
        zone_order = zone_rank,
        must_change_password = true
    where id = new_id;
  else
    insert into public.profiles (
      id, team_id, display_name, email, role, is_active,
      account, zone, grade, zone_order, must_change_password
    ) values (
      new_id, actor.team_id, clean_name, login_email, clean_role, true,
      clean_account, clean_zone, clean_grade, zone_rank, true
    );
  end if;

  return new_id;
end;
$$;

create or replace function public.admin_remove_member(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor public.profiles;
  dest public.profiles;
begin
  if auth.uid() is null then
    raise exception '請先登入';
  end if;

  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null or actor.role is distinct from 'admin' then
    raise exception '只有管理員可以刪除夥伴';
  end if;
  if target = actor.id then
    raise exception '不能刪除自己';
  end if;

  select * into dest from public.profiles where id = target and team_id = actor.team_id;
  if dest.id is null then
    raise exception '找不到這位夥伴';
  end if;
  if dest.role = 'admin' then
    raise exception '不能刪除管理員';
  end if;

  perform set_config('app.admin_member', 'yes', true);
  update public.profiles
  set is_active = false
  where id = dest.id;

  update auth.users
  set banned_until = timestamptz '2099-12-31 00:00:00+00'
  where id = dest.id;
end;
$$;

revoke all on function public.admin_create_member(text, text, text, text, public.member_role) from public, anon;
revoke all on function public.admin_remove_member(uuid) from public, anon;
grant execute on function public.admin_create_member(text, text, text, text, public.member_role) to authenticated, service_role;
grant execute on function public.admin_remove_member(uuid) to authenticated, service_role;

comment on function public.admin_reset_password(uuid) is '管理員把同團隊夥伴的密碼改回 private.app_settings.default_password，並要求下次登入再改。';
comment on function public.admin_create_member(text, text, text, text, public.member_role) is '管理員用預設密碼建立夥伴。沒有自動建立 profile 的觸發器時會自己插入；若已有同一 id 的 profile 則更新，避免重複一列。';
comment on function public.admin_remove_member(uuid) is '管理員停用夥伴並禁止登入。客戶資料保留。不能刪除自己或管理員。';
comment on function public.can_view_owner(uuid) is '管理員看全團隊，主管看自己區，夥伴看自己。';

drop policy if exists customers_read_owner_or_manager on public.customers;
create policy customers_read_owner_or_manager on public.customers
for select to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists customers_insert_owner_or_manager on public.customers;
create policy customers_insert_owner_or_manager on public.customers
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id
      and p.team_id = public.current_team_id()
      and p.is_active = true
  )
);

drop policy if exists customers_update_owner_or_manager on public.customers;
create policy customers_update_owner_or_manager on public.customers
for update to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
)
with check (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.team_id = public.current_team_id()
  )
);

drop policy if exists policies_read_owner_or_manager on public.policies;
create policy policies_read_owner_or_manager on public.policies
for select to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists policies_insert_owner_aligned on public.policies;
create policy policies_insert_owner_aligned on public.policies
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and public.can_view_owner(c.owner_id)
  )
);

drop policy if exists policies_update_owner_or_manager on public.policies;
create policy policies_update_owner_or_manager on public.policies
for update to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
)
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and public.can_view_owner(c.owner_id)
  )
);

drop policy if exists policies_delete_owner_or_manager on public.policies;
create policy policies_delete_owner_or_manager on public.policies
for delete to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists service_records_read_owner_or_manager on public.service_records;
create policy service_records_read_owner_or_manager on public.service_records
for select to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists service_records_insert_owner_aligned on public.service_records;
create policy service_records_insert_owner_aligned on public.service_records
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and public.can_view_owner(c.owner_id)
  )
);

drop policy if exists service_records_update_owner_or_manager on public.service_records;
create policy service_records_update_owner_or_manager on public.service_records
for update to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
)
with check (
  team_id = public.current_team_id()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = owner_id
      and public.can_view_owner(c.owner_id)
  )
);

drop policy if exists service_records_delete_owner_or_manager on public.service_records;
create policy service_records_delete_owner_or_manager on public.service_records
for delete to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists calendar_events_select_owner_or_manager on public.calendar_events;
create policy calendar_events_select_owner_or_manager on public.calendar_events
for select to authenticated
using (
  team_id = public.current_team_id()
  and public.can_view_owner(owner_id)
);

drop policy if exists profiles_read_self_or_managers on public.profiles;
create policy profiles_read_self_or_managers on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (
    team_id = public.current_team_id()
    and public.can_view_owner(id)
  )
);

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
    and public.can_view_owner(p.id)
  order by p.display_name
$$;

create or replace function public.team_roster()
returns table (
  id uuid,
  display_name text,
  account text,
  zone text,
  grade text,
  zone_order integer,
  role public.member_role
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.account, p.zone, p.grade, p.zone_order, p.role
  from public.profiles p
  where p.team_id = public.current_team_id()
    and p.is_active
    and public.can_view_owner(p.id)
  order by p.zone_order nulls last,
    case p.grade
      when 'UM' then 1
      when 'SP' then 2
      when 'CA' then 3
      else 4
    end,
    p.display_name
$$;

revoke all on function public.team_directory() from public, anon;
revoke all on function public.team_roster() from public, anon;
grant execute on function public.team_directory() to authenticated, service_role;
grant execute on function public.team_roster() to authenticated, service_role;
