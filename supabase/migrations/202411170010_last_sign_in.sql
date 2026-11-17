-- 管理員查看同團隊夥伴的上次登入時間。
-- 請在 Supabase SQL Editor 執行一次。不要從網站連上正式資料庫。

create or replace function public.admin_member_activity()
returns table (
  id uuid,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.is_active
      and me.role = 'admin'
      and me.team_id = p.team_id
  );
$$;

revoke all on function public.admin_member_activity() from public, anon;
grant execute on function public.admin_member_activity() to authenticated, service_role;

comment on function public.admin_member_activity() is '管理員讀同團隊夥伴的上次登入時間。其他人不會拿到任何列。';
