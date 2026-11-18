-- 職級新增 AM（業務襄理）、DM（處經理），並修正既有職稱對照在應用層處理。
-- 不改既有資料。這份請自行套用，還沒執行到正式資料庫。

alter table public.profiles drop constraint if exists profiles_grade_chk;

alter table public.profiles
  add constraint profiles_grade_chk check (
    grade is null or grade in ('CA', 'SP', 'AM', 'UM', 'DM', 'ADMIN')
  );

comment on column public.profiles.grade is '職級 CA、SP、AM、UM、DM，或管理員列 ADMIN。';

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
  if clean_grade not in ('CA', 'SP', 'AM', 'UM', 'DM') then
    raise exception '職級請選 CA、SP、AM、UM 或 DM';
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
  if secret is null or char_length(btrim(secret)) < 1 then
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
      when 'DM' then 1
      when 'UM' then 2
      when 'AM' then 3
      when 'SP' then 4
      when 'CA' then 5
      else 6
    end,
    p.display_name
$$;


revoke all on function public.admin_create_member(text, text, text, text, public.member_role) from public, anon;
grant execute on function public.admin_create_member(text, text, text, text, public.member_role) to authenticated, service_role;
revoke all on function public.team_roster() from public, anon;
grant execute on function public.team_roster() to authenticated, service_role;
