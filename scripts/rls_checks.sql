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

reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set zone = '示範一區', grade = 'SP' where id = '20000000-0000-4000-8000-000000000002';
update public.profiles set zone = '示範一區', grade = 'CA', must_change_password = false where id = '20000000-0000-4000-8000-000000000003';
update public.profiles set zone = '示範二區', grade = 'CA' where id = '20000000-0000-4000-8000-000000000004';
insert into private.app_settings (key, value) values ('default_password', 'test-default-pass');
insert into public.policies (id, team_id, customer_id, owner_id, policy_category, reference_last4)
values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003',
  '意外',
  '1280'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

do $$
declare n int;
begin
  select count(*) into n from public.customers;
  if n <> 1 then raise exception '主管應只看到自己區的 1 位客戶，實際 %', n; end if;
  select count(*) into n from public.customers where display_name = '陳媽媽（示範）';
  if n <> 0 then raise exception '主管不該看到其他區的客戶'; end if;
  select count(*) into n from public.customers where display_name = '外人客戶';
  if n <> 0 then raise exception '主管不該看到其他團隊'; end if;
  select count(*) into n from public.social_accounts;
  if n <> 2 then raise exception '主管應看到同團隊 2 個 IG，實際 %', n; end if;
  update public.customers set notes = '主管不該改' where display_name like '王先生%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '主管不該改別人的客戶，實際改了 %', n; end if;
  delete from public.policies where reference_last4 = '1280';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '主管不該刪別人的保單，實際刪了 %', n; end if;
  begin
    insert into public.customers (team_id, owner_id, display_name)
    values (public.current_team_id(), '20000000-0000-4000-8000-000000000003', '不該新增');
    raise exception '主管不該替別人新增客戶';
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into public.contact_logs (team_id, owner_id, customer_id, log_date, actions, note)
    values (public.current_team_id(), '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', current_date, array['訊息定聯'], '不該寫');
    raise exception '主管不該替別人寫 FBFLI';
  exception
    when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
insert into public.contact_logs (team_id, owner_id, customer_id, log_date, actions, note, summary)
values (public.current_team_id(), auth.uid(), '30000000-0000-4000-8000-000000000001', current_date, array['訊息定聯'], '虛構紀錄', '在意的事：虛構');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
do $$
declare n int;
begin
  select count(*) into n from public.contact_logs;
  if n <> 1 then raise exception '主管應看得到同區 FBFLI，實際 %', n; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
declare
  flag boolean;
  new_id uuid;
begin
  perform public.admin_reset_password('20000000-0000-4000-8000-000000000003');
  select must_change_password into flag from public.profiles where id = '20000000-0000-4000-8000-000000000003';
  if flag is distinct from true then raise exception '重設後應要求改密碼'; end if;
  new_id := public.admin_create_member('測試夥伴', 'ceshi', 'CA', '示範一區', 'member');
  if not exists (
    select 1 from public.profiles
    where id = new_id and account = 'ceshi' and must_change_password and is_active
  ) then
    raise exception '新夥伴沒有建立';
  end if;
  perform public.admin_remove_member(new_id);
  if not exists (
    select 1 from public.profiles where id = new_id and is_active = false
  ) then
    raise exception '刪除後應停用而不是清掉資料';
  end if;
end $$;

do $$
begin
  perform public.admin_remove_member('20000000-0000-4000-8000-000000000001');
  raise exception '不該刪除自己';
exception
  when others then
    if sqlerrm not like '%不能刪除自己%' then raise; end if;
end $$;

reset role;
update auth.users set last_sign_in_at = timestamptz '2026-11-17 14:05:00+00' where id = '20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

do $$
declare n int;
begin
  select count(*) into n from public.admin_member_activity();
  if n < 1 then raise exception '管理員應看到上次登入，實際 %', n; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);

do $$
declare n int;
begin
  select count(*) into n from public.admin_member_activity();
  if n <> 0 then raise exception '夥伴不該看到上次登入，實際 %', n; end if;
end $$;

reset role;
do $$
begin
  if not exists (
    select 1 from auth.users
    where id = '20000000-0000-4000-8000-000000000003' and encrypted_password is not null
  ) then
    raise exception '重設後登入密碼沒有寫入';
  end if;
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    where p.account = 'ceshi' and u.banned_until is not null and p.is_active = false
  ) then
    raise exception '刪除後應禁止登入並保留資料';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);

do $$
begin
  perform public.admin_reset_password('20000000-0000-4000-8000-000000000004');
  raise exception '夥伴不該重設別人的密碼';
exception
  when others then
    if sqlerrm not like '%只有管理員%' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);

do $$
declare n int;
begin
  select count(*) into n from public.customers where display_name like '王先生%';
  if n <> 0 then raise exception '其他團隊不該看到南恩的客戶'; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);

insert into public.car_renewals (name, plate, car_type, ct_date, vo_date, note)
values ('王先生（示範）', 'ABC-1234', '轎車', '2026-12-01', '2026-12-08', '虛構');

do $$
declare n int;
begin
  select count(*) into n from public.car_renewals;
  if n <> 1 then raise exception '夥伴應看到自己的車險，實際 %', n; end if;
end $$;

savepoint car_one_date;
insert into public.car_renewals (name, plate, car_type, vo_date)
values ('只任意（示範）', 'ZZ-1001', '汽車', '2026-12-01');
do $$
declare n int;
begin
  select count(*) into n from public.car_renewals where plate = 'ZZ-1001' and ct_date is null;
  if n <> 1 then raise exception '只填任意險應可儲存，實際 %', n; end if;
end $$;
do $$
begin
  insert into public.car_renewals (name, plate) values ('沒日期', 'ZZ-1002');
  raise exception '兩個到期日都空不該寫入';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like '%都空%' then raise; end if;
end $$;
rollback to savepoint car_one_date;

do $$
begin
  insert into public.car_renewals (owner_id, name, plate, ct_date, vo_date)
  values ('20000000-0000-4000-8000-000000000004', '不該建立', 'ZZZ-0001', '2026-12-01', '2026-12-01');
  raise exception '夥伴不該替別人建立車險';
exception
  when insufficient_privilege or check_violation then
    null;
  when others then
    if sqlerrm like '%不該替別人%' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

do $$
declare n int;
begin
  select count(*) into n from public.car_renewals;
  if n <> 0 then raise exception '主管不該看到別人的車險，實際 %', n; end if;
  update public.car_renewals set plate = 'ZZZ-0000';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '主管不該改別人的車險，實際 %', n; end if;
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
