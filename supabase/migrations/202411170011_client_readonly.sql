-- 主管可以查看自己區的名單，但不能新增、修改或刪除別人的客戶、保單摘要或服務紀錄。
-- 查詢仍用 can_view_owner。這份只把寫入收回「只能動 owner_id = 自己」的那一列。

drop policy if exists customers_insert_owner_or_manager on public.customers;
drop policy if exists customers_insert_owner on public.customers;
create policy customers_insert_owner on public.customers
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);

drop policy if exists customers_update_owner_or_manager on public.customers;
drop policy if exists customers_update_owner on public.customers;
create policy customers_update_owner on public.customers
for update to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
)
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);

drop policy if exists customers_delete_admin on public.customers;
drop policy if exists customers_delete_owner on public.customers;
create policy customers_delete_owner on public.customers
for delete to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);

drop policy if exists policies_insert_owner_aligned on public.policies;
drop policy if exists policies_insert_owner on public.policies;
create policy policies_insert_owner on public.policies
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists policies_update_owner_or_manager on public.policies;
drop policy if exists policies_update_owner on public.policies;
create policy policies_update_owner on public.policies
for update to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
)
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists policies_delete_owner_or_manager on public.policies;
drop policy if exists policies_delete_owner on public.policies;
create policy policies_delete_owner on public.policies
for delete to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);

drop policy if exists service_records_insert_owner_aligned on public.service_records;
drop policy if exists service_records_insert_owner on public.service_records;
create policy service_records_insert_owner on public.service_records
for insert to authenticated
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists service_records_update_owner_or_manager on public.service_records;
drop policy if exists service_records_update_owner on public.service_records;
create policy service_records_update_owner on public.service_records
for update to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
)
with check (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.team_id = public.current_team_id()
      and c.owner_id = auth.uid()
  )
);

drop policy if exists service_records_delete_owner_or_manager on public.service_records;
drop policy if exists service_records_delete_owner on public.service_records;
create policy service_records_delete_owner on public.service_records
for delete to authenticated
using (
  team_id = public.current_team_id()
  and owner_id = auth.uid()
);
