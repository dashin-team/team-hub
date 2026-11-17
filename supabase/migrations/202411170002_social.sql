-- 南恩團隊 TEAM HUB 社群經營追蹤
-- 先執行 202411170001_base.sql。
-- 這裡不存 Instagram 密碼，也不存 Meta OAuth access token。
-- 自動同步是後續階段，權杖只能放在 Edge Function 的密鑰，不能放進這份資料表或網頁。

do $$
begin
  if not exists (select 1 from pg_type where typname = 'social_connection_status') then
    create type public.social_connection_status as enum ('manual', 'pending', 'connected', 'expired', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'social_data_source') then
    create type public.social_data_source as enum ('manual', 'meta_api', 'imported');
  end if;
  if not exists (select 1 from pg_type where typname = 'social_content_type') then
    create type public.social_content_type as enum ('post', 'reel');
  end if;
end $$;

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'instagram',
  instagram_username text not null,
  profile_url text,
  account_type text not null default 'unknown',
  connection_status public.social_connection_status not null default 'manual',
  consented_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_platform_chk check (platform = 'instagram'),
  constraint social_accounts_type_chk check (account_type in ('personal', 'creator', 'business', 'unknown')),
  constraint social_accounts_username_len check (char_length(btrim(instagram_username)) between 1 and 40),
  constraint social_accounts_url_https check (profile_url is null or profile_url ~* '^https://'),
  unique (owner_id, platform),
  unique (id, owner_id, team_id)
);

create index social_accounts_team_idx on public.social_accounts (team_id, owner_id);

create table public.social_follower_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  snapshot_date date not null,
  follower_count integer not null,
  following_count integer,
  source public.social_data_source not null default 'manual',
  verified boolean not null default false,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_follower_count_chk check (follower_count >= 0),
  constraint social_following_count_chk check (following_count is null or following_count >= 0),
  foreign key (account_id, owner_id, team_id)
    references public.social_accounts (id, owner_id, team_id) on delete cascade,
  unique (account_id, snapshot_date)
);

create index social_follower_owner_date_idx on public.social_follower_snapshots (owner_id, snapshot_date desc);
create index social_follower_team_date_idx on public.social_follower_snapshots (team_id, snapshot_date desc);

create table public.social_story_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  story_date date not null,
  posted boolean not null default false,
  story_count integer not null default 0,
  source public.social_data_source not null default 'manual',
  note text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_story_count_chk check (story_count between 0 and 100),
  constraint social_story_posted_chk check (
    (posted and story_count > 0) or (not posted and story_count = 0)
  ),
  foreign key (account_id, owner_id, team_id)
    references public.social_accounts (id, owner_id, team_id) on delete cascade,
  unique (account_id, story_date)
);

create index social_story_owner_date_idx on public.social_story_logs (owner_id, story_date desc);
create index social_story_team_date_idx on public.social_story_logs (team_id, story_date desc);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  content_type public.social_content_type not null,
  published_at timestamptz not null,
  permalink text,
  source public.social_data_source not null default 'manual',
  external_media_id text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_url_https check (permalink is null or permalink ~* '^https://'),
  foreign key (account_id, owner_id, team_id)
    references public.social_accounts (id, owner_id, team_id) on delete cascade
);

create index social_posts_owner_published_idx on public.social_posts (owner_id, published_at desc);
create index social_posts_team_published_idx on public.social_posts (team_id, published_at desc);
create unique index social_posts_external_id_unique
  on public.social_posts (account_id, external_media_id)
  where external_media_id is not null;

-- 一般登入者不能自己把帳號標成已授權，也不能寫入同步時間。那是以後伺服器同步才做的事。
create or replace function public.protect_social_connection()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.connection_status := 'manual';
      new.last_synced_at := null;
    else
      new.connection_status := old.connection_status;
      new.last_synced_at := old.last_synced_at;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.stamp_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_social_accounts_updated_at before update on public.social_accounts
for each row execute function public.set_updated_at();
create trigger trg_social_follower_updated_at before update on public.social_follower_snapshots
for each row execute function public.set_updated_at();
create trigger trg_social_story_updated_at before update on public.social_story_logs
for each row execute function public.set_updated_at();
create trigger trg_social_posts_updated_at before update on public.social_posts
for each row execute function public.set_updated_at();

create trigger trg_social_accounts_connection
before insert or update on public.social_accounts
for each row execute function public.protect_social_connection();

create trigger trg_social_follower_actor
before insert or update on public.social_follower_snapshots
for each row execute function public.stamp_actor();
create trigger trg_social_story_actor
before insert or update on public.social_story_logs
for each row execute function public.stamp_actor();
create trigger trg_social_posts_actor
before insert or update on public.social_posts
for each row execute function public.stamp_actor();

alter table public.social_accounts enable row level security;
alter table public.social_follower_snapshots enable row level security;
alter table public.social_story_logs enable row level security;
alter table public.social_posts enable row level security;

create policy social_accounts_read_owner_or_manager on public.social_accounts
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy social_accounts_insert_self on public.social_accounts
for insert to authenticated
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_accounts_update_self on public.social_accounts
for update to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_accounts_delete_self on public.social_accounts
for delete to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_follower_read_owner_or_manager on public.social_follower_snapshots
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy social_follower_insert_self on public.social_follower_snapshots
for insert to authenticated
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_follower_update_self on public.social_follower_snapshots
for update to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_follower_delete_self on public.social_follower_snapshots
for delete to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_story_read_owner_or_manager on public.social_story_logs
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy social_story_insert_self on public.social_story_logs
for insert to authenticated
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_story_update_self on public.social_story_logs
for update to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_story_delete_self on public.social_story_logs
for delete to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_posts_read_owner_or_manager on public.social_posts
for select to authenticated
using (
  team_id = public.current_team_id()
  and (owner_id = auth.uid() or public.is_team_manager())
);

create policy social_posts_insert_self on public.social_posts
for insert to authenticated
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_posts_update_self on public.social_posts
for update to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid())
with check (team_id = public.current_team_id() and owner_id = auth.uid());

create policy social_posts_delete_self on public.social_posts
for delete to authenticated
using (team_id = public.current_team_id() and owner_id = auth.uid());

-- 最新一筆粉絲數相對前一筆的淨增與成長率。
-- 沒有前一筆，或前一筆是 0，成長率為 null（畫面顯示 —）。
-- security_invoker 讓底層 RLS 仍依登入者生效。
create or replace view public.social_follower_growth
with (security_invoker = true) as
select
  a.team_id,
  a.owner_id,
  a.id as account_id,
  a.instagram_username,
  latest.snapshot_date as latest_date,
  latest.follower_count as latest_followers,
  prev.snapshot_date as previous_date,
  prev.follower_count as previous_followers,
  case
    when prev.follower_count is null then null
    else latest.follower_count - prev.follower_count
  end as net_growth,
  case
    when prev.follower_count is null or prev.follower_count = 0 then null
    else round((latest.follower_count - prev.follower_count)::numeric / prev.follower_count * 100, 2)
  end as growth_rate_pct,
  latest.source as latest_source,
  latest.verified as latest_verified
from public.social_accounts a
join lateral (
  select s.*
  from public.social_follower_snapshots s
  where s.account_id = a.id
  order by s.snapshot_date desc
  limit 1
) latest on true
left join lateral (
  select s.*
  from public.social_follower_snapshots s
  where s.account_id = a.id
    and s.snapshot_date < latest.snapshot_date
  order by s.snapshot_date desc
  limit 1
) prev on true;

revoke all on table
  public.social_accounts,
  public.social_follower_snapshots,
  public.social_story_logs,
  public.social_posts
from anon;

grant select, insert, update, delete on table
  public.social_accounts,
  public.social_follower_snapshots,
  public.social_story_logs,
  public.social_posts
to authenticated;

grant all on table
  public.social_accounts,
  public.social_follower_snapshots,
  public.social_story_logs,
  public.social_posts
to service_role;

revoke all on table public.social_follower_growth from anon;
grant select on table public.social_follower_growth to authenticated, service_role;

revoke all on function public.protect_social_connection() from public, anon;
revoke all on function public.stamp_actor() from public, anon;
grant execute on function public.protect_social_connection() to authenticated, service_role;
grant execute on function public.stamp_actor() to authenticated, service_role;

comment on table public.social_accounts is 'Instagram 帳號中繼資料。禁止存放密碼或 OAuth access token。';
comment on table public.social_follower_snapshots is '粉絲數快照，保留歷史才能計算淨增與成長率。來源分手動、官方 API、匯入。';
comment on table public.social_story_logs is '每日限動回報。同一帳號同一天只有一筆，再次送出會更新。未回報不要當成未發布。';
comment on table public.social_posts is '貼文與 Reels 的發布紀錄，不存私人訊息或限動內容。';
comment on view public.social_follower_growth is '受 RLS 保護。淨增 = 最新快照減去前一筆快照。';
