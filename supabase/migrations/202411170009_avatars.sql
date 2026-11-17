-- 個人頭像。請在 Supabase SQL Editor 執行一次。不要從網站連上正式資料庫。
-- protect_profile_privileges 只鎖角色、團隊、帳號、職級和 must_change_password。
-- avatar_url 不在鎖的清單裡，本人更新自己的頭像網址不會被擋下。

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is '公開頭像網址。本人可自己更新；保護觸發器沒有鎖這個欄位。';

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

  execute 'drop policy if exists avatars_public_read on storage.objects';
  execute 'drop policy if exists avatars_owner_insert on storage.objects';
  execute 'drop policy if exists avatars_owner_update on storage.objects';
  execute 'drop policy if exists avatars_owner_delete on storage.objects';

  execute $policy$
    create policy avatars_public_read on storage.objects
    for select to public
    using (bucket_id = 'avatars')
  $policy$;

  execute $policy$
    create policy avatars_owner_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;

  execute $policy$
    create policy avatars_owner_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;

  execute $policy$
    create policy avatars_owner_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
end $$;
