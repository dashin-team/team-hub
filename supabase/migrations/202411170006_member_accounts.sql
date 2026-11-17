-- 同仁帳號欄位。已在正式環境執行過，這份是倉庫裡的紀錄。
-- 在 202411170005 之後。不要把 service_role 放進網頁。

alter table public.profiles
  add column account text,
  add column zone text,
  add column grade text,
  add column zone_order integer,
  add column must_change_password boolean not null default true;

create unique index profiles_account_lower_idx on public.profiles (lower(account));

alter table public.profiles
  add constraint profiles_grade_chk check (
    grade is null or grade in ('UM', 'SP', 'CA', 'ADMIN')
  );

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

create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.pw_changed', 'yes', true);
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
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
  order by p.zone_order nulls last,
    case p.grade
      when 'UM' then 1
      when 'SP' then 2
      when 'CA' then 3
      else 4
    end,
    p.display_name
$$;

revoke all on function public.mark_password_changed() from public, anon;
revoke all on function public.team_roster() from public, anon;
grant execute on function public.mark_password_changed() to authenticated, service_role;
grant execute on function public.team_roster() to authenticated, service_role;

comment on column public.profiles.account is '登入帳號。網頁會對應成帳號@nanen-team.app，南恩則是管理員信箱。';
comment on column public.profiles.grade is '職級 UM、SP、CA，或管理員列 ADMIN。';
comment on function public.mark_password_changed() is '第一次改密碼後清掉 must_change_password。';
comment on function public.team_roster() is '同團隊啟用中的同仁。畫面要排除 ADMIN。';
