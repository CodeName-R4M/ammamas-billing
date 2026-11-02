/*
# Admin access control hardening

Plain-English summary
This script fixes how the app decides who is an admin and who is staff. The
previous version read the role from the login token, which never contains the
role, so admin permissions never worked. Roles are now read from the staff
profile table, and users can no longer edit their own role or other profile
fields directly.

1. New Helper Functions
- `is_staff()` returns true when the signed-in user has an active staff profile.
- `is_admin()` returns true when the signed-in user is an active admin.
- The old `app_role()` function is removed.

2. Modified Tables (row level security policies rebuilt)
- Every policy on the existing tables is dropped and recreated so that:
  - Catalog, settings, supplier and purchase data is readable only by active staff.
  - Only admins can create, change or delete catalog, pricing, supplier and coupon data.
  - Cashiers can create sales, sale items and payments only for their own sales.
  - Cashiers can read only their own sales, sale items and payments; admins read all.
  - Inventory movements are an append-only ledger: admins can add, nobody can edit or delete.
  - Audit logs are readable and writable by admins only.
- Storage: product images in the `catalog` bucket stay publicly readable; only admins can upload, replace or delete them.

3. Security Changes
- `profiles` is read-only for signed-in users (own row, or all rows for admins).
  Role, name and active status can only be changed through the staff functions
  in the next script.
- The `anon` role loses all access to the public schema tables.
- Helper functions are not callable by the public or anonymous roles.

Important notes
1. Run this script after 0001 to 0003.
2. It is safe to run again: policies are dropped and recreated, and grants are restated.
3. No data is changed or removed by this script.
*/

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and active
  );
$$;

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and tablename = 'objects' and policyname like 'catalog\_%')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function if exists app_role();

alter table profiles enable row level security;
alter table business_settings enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table inventory_movements enable row level security;
alter table coupons enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table suppliers enable row level security;
alter table purchase_invoices enable row level security;
alter table purchase_items enable row level security;
alter table supplier_payments enable row level security;
alter table audit_logs enable row level security;

create policy "profiles_select_own_or_admin" on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'business_settings', 'categories', 'products', 'suppliers',
    'purchase_invoices', 'purchase_items', 'supplier_payments'
  ]
  loop
    execute format('create policy %I on %I for select to authenticated using (public.is_staff())', t || '_select_staff', t);
    execute format('create policy %I on %I for insert to authenticated with check (public.is_admin())', t || '_insert_admin', t);
    execute format('create policy %I on %I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update_admin', t);
    execute format('create policy %I on %I for delete to authenticated using (public.is_admin())', t || '_delete_admin', t);
  end loop;
end $$;

create policy "coupons_select_active_or_admin" on coupons for select to authenticated
  using (public.is_admin() or (public.is_staff() and active));
create policy "coupons_insert_admin" on coupons for insert to authenticated
  with check (public.is_admin());
create policy "coupons_update_admin" on coupons for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "coupons_delete_admin" on coupons for delete to authenticated
  using (public.is_admin());

create policy "inventory_movements_select_staff" on inventory_movements for select to authenticated
  using (public.is_staff());
create policy "inventory_movements_insert_admin" on inventory_movements for insert to authenticated
  with check (public.is_admin());

create policy "sales_select_own_or_admin" on sales for select to authenticated
  using (public.is_staff() and (cashier_id = auth.uid() or public.is_admin()));
create policy "sales_insert_own" on sales for insert to authenticated
  with check (public.is_staff() and cashier_id = auth.uid());
create policy "sales_update_admin" on sales for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "sales_delete_admin" on sales for delete to authenticated
  using (public.is_admin());

create policy "sale_items_select_own_or_admin" on sale_items for select to authenticated
  using (
    public.is_staff() and exists (
      select 1 from sales s
      where s.id = sale_items.sale_id
        and (s.cashier_id = auth.uid() or public.is_admin())
    )
  );
create policy "sale_items_insert_own" on sale_items for insert to authenticated
  with check (
    public.is_staff() and exists (
      select 1 from sales s
      where s.id = sale_items.sale_id and s.cashier_id = auth.uid()
    )
  );
create policy "sale_items_update_admin" on sale_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "sale_items_delete_admin" on sale_items for delete to authenticated
  using (public.is_admin());

create policy "payments_select_own_or_admin" on payments for select to authenticated
  using (
    public.is_staff() and exists (
      select 1 from sales s
      where s.id = payments.sale_id
        and (s.cashier_id = auth.uid() or public.is_admin())
    )
  );
create policy "payments_insert_own" on payments for insert to authenticated
  with check (
    public.is_staff() and exists (
      select 1 from sales s
      where s.id = payments.sale_id and s.cashier_id = auth.uid()
    )
  );
create policy "payments_update_admin" on payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "payments_delete_admin" on payments for delete to authenticated
  using (public.is_admin());

create policy "audit_logs_select_admin" on audit_logs for select to authenticated
  using (public.is_admin());
create policy "audit_logs_insert_admin" on audit_logs for insert to authenticated
  with check (public.is_admin());

create policy "catalog_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog');
create policy "catalog_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_admin());
create policy "catalog_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_admin())
  with check (bucket_id = 'catalog' and public.is_admin());
create policy "catalog_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_admin());

revoke all on all tables in schema public from anon;

revoke insert, update, delete on profiles from authenticated;
grant select on profiles to authenticated;
grant select, update on business_settings to authenticated;
grant select, insert, update, delete on categories to authenticated;
grant select, insert, update, delete on products to authenticated;
grant select, insert, delete on inventory_movements to authenticated;
grant select, insert, update, delete on coupons to authenticated;
grant select, insert, update, delete on sales to authenticated;
grant select, insert, update, delete on sale_items to authenticated;
grant select, insert, update, delete on payments to authenticated;
grant select, insert, update, delete on suppliers to authenticated;
grant select, insert, update, delete on purchase_invoices to authenticated;
grant select, insert, update, delete on purchase_items to authenticated;
grant select, insert, update, delete on supplier_payments to authenticated;
grant select, insert on audit_logs to authenticated;
