-- 確保本人可刪自己的 FBFLI 紀錄。不改既有列。
-- 請自行套用，還沒執行到正式資料庫。
-- 若 contact_logs 還沒建立，請先執行 202411170012_contact_logs.sql。

do $$
begin
  if to_regclass('public.contact_logs') is null then
    raise notice 'contact_logs 尚未建立，請先執行 202411170012_contact_logs.sql';
    return;
  end if;

  execute 'drop policy if exists contact_logs_delete_owner on public.contact_logs';
  execute $policy$
    create policy contact_logs_delete_owner on public.contact_logs
    for delete to authenticated
    using (
      team_id = public.current_team_id()
      and owner_id = auth.uid()
    )
  $policy$;

  grant delete on table public.contact_logs to authenticated;
end $$;
