-- 在遷移之後執行。驗證夥伴隔離、主管範圍、角色鎖、限動 upsert 與成長率。
begin;

insert into auth.users (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000005');

insert into public.teams (id, name) values
  ('10000000-0000-4000-8000-000000000001', '南恩團隊'),
  ('10000000-0000-4000-8000-000000000002', '其他團隊');

insert into public.profiles (id, team_id, display_name, email, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '梁仕翰', 'han@example.com', 'admin'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '陳可恩', 'keen@example.com', 'manager'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '林子安', 'zian@example.com', 'member'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '黃詩涵', 'shihan@example.com', 'member'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '外人', 'out@example.com', 'member');

insert into public.customers (id, team_id, owner_id, display_name) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '王先生（示範）'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '陳媽媽（示範）'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', '外人客戶');

insert into public.social_accounts (id, team_id, owner_id, instagram_username, connection_status) values
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'zian.lin', 'manual'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'shihan.huang', 'manual'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'outsider', 'manual');

insert into public.social_follower_snapshots (account_id, team_id, owner_id, snapshot_date, follower_count, source) values
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '2026-11-10', 1160, 'manual'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '2026-11-17', 1280, 'manual'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '2026-11-17', 860, 'manual');

insert into public.social_story_logs (account_id, team_id, owner_id, story_date, posted, story_count) values
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '2026-11-17', true, 2),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '2026-11-17', false, 0);

grant anon to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare n int;
begin
  select count(*) into n from public.customers;
  if n <> 1 then raise exception '夥伴 A 應只看到 1 位客戶，實際 %', n; end if;
  select count(*) into n from public.social_story_logs;
  if n <> 1 then raise exception '夥伴 A 不應看到別人的限動，實際 %', n; end if;
  select count(*) into n from public.social_follower_growth;
  if n <> 1 then raise exception '成長 view 應只剩自己的帳號，實際 %', n; end if;
  select net_growth into n from public.social_follower_growth;
  if n <> 120 then raise exception '淨增應為 120，實際 %', n; end if;
end $$;

do $$
begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception '夥伴不該能把自己改成管理員';
exception
  when others then
    if sqlerrm not like '%只能由管理員%' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.customers (team_id, owner_id, display_name)
  values (public.current_team_id(), '20000000-0000-4000-8000-000000000004', '不該建立');
  raise exception '夥伴不該替別人建立客戶';
exception
  when insufficient_privilege or check_violation or raise_exception then
    if sqlerrm like '%不該替別人%' then raise; end if;
  when others then
    null;
end $$;

insert into public.social_story_logs (account_id, team_id, owner_id, story_date, posted, story_count)
values ('40000000-0000-4000-8000-000000000003', public.current_team_id(), auth.uid(), '2026-11-17', true, 3)
on conflict (account_id, story_date) do update
set posted = excluded.posted, story_count = excluded.story_count;

do $$
declare n int;
begin
  select count(*) into n from public.social_story_logs where story_date = '2026-11-17';
  if n <> 1 then raise exception '同一天限動應被更新而不是新增，實際 %', n; end if;
  select story_count into n from public.social_story_logs where story_date = '2026-11-17';
  if n <> 3 then raise exception '限動則數應更新為 3，實際 %', n; end if;
end $$;

do $$
begin
  insert into public.social_posts (account_id, team_id, owner_id, content_type, published_at, permalink)
  values ('40000000-0000-4000-8000-000000000003', public.current_team_id(), auth.uid(), 'post', now(), 'http://example.com/nope');
  raise exception 'http 連結不該被接受';
exception
  when check_violation then
    null;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

do $$
declare n int;
begin
  select count(*) into n from public.customers;
  if n <> 2 then raise exception '主管應看到同團隊 2 位客戶，實際 %', n; end if;
  select count(*) into n from public.customers where display_name = '外人客戶';
  if n <> 0 then raise exception '主管不該看到其他團隊'; end if;
  select count(*) into n from public.social_accounts;
  if n <> 2 then raise exception '主管應看到同團隊 2 個 IG，實際 %', n; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);

do $$
declare n int;
begin
  select count(*) into n from public.customers where display_name like '王先生%';
  if n <> 0 then raise exception '其他團隊不該看到南恩的客戶'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

do $$
begin
  perform 1 from public.customers;
  raise exception '訪客不該讀到客戶';
exception
  when insufficient_privilege then
    null;
end $$;

rollback;
