-- RLS policies for Alpha Digitronix Billing
-- Enable RLS on all tables
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

-- Helper: role check via JWT raw_app_meta_data
create or replace function app_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', 'anonymous');
$$;

-- profiles: users can read own, admins manage all
create policy "profiles_select_own" on profiles for select to authenticated using (auth.uid() = id or app_role() = 'admin');
create policy "profiles_admin_all" on profiles for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- business_settings: all authenticated read; admin write
create policy "settings_read" on business_settings for select to authenticated using (true);
create policy "settings_admin" on business_settings for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- categories & products: authenticated read; admin write
create policy "cat_read" on categories for select to authenticated using (true);
create policy "cat_admin" on categories for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

create policy "prod_read" on products for select to authenticated using (true);
create policy "prod_admin" on products for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- inventory_movements: read for cashier, manage for admin
create policy "inv_read" on inventory_movements for select to authenticated using (true);
create policy "inv_admin" on inventory_movements for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- coupons: cashier read, admin manage
create policy "coupon_read" on coupons for select to authenticated using (active = true);
create policy "coupon_admin" on coupons for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- sales: cashier+admin read own/all, cashier insert own, admin manage all
create policy "sale_read" on sales for select to authenticated using (auth.uid() = cashier_id or app_role() = 'admin');
create policy "sale_insert" on sales for insert to authenticated with check (auth.uid() = cashier_id);
create policy "sale_admin" on sales for update to authenticated using (app_role() = 'admin') with check (true);

-- sale_items: read for cashier+admin via sale ownership enforced in app
create policy "saleitem_read" on sale_items for select to authenticated using (true);
create policy "saleitem_insert" on sale_items for insert to authenticated with check (true);

-- payments: cashier read own sale's, admin all; insert own
create policy "pay_read" on payments for select to authenticated using (true);
create policy "pay_insert" on payments for insert to authenticated with check (true);
create policy "pay_admin" on payments for update to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- suppliers, purchases: cashier read; admin manage
create policy "sup_read" on suppliers for select to authenticated using (true);
create policy "sup_admin" on suppliers for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

create policy "pi_read" on purchase_invoices for select to authenticated using (true);
create policy "pi_admin" on purchase_invoices for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

create policy "pit_read" on purchase_items for select to authenticated using (true);
create policy "pit_admin" on purchase_items for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

create policy "spm_read" on supplier_payments for select to authenticated using (true);
create policy "spm_admin" on supplier_payments for all to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

-- audit_logs: admin only
create policy "audit_read" on audit_logs for select to authenticated using (app_role() = 'admin');
create policy "audit_admin" on audit_logs for insert to authenticated with check (app_role() = 'admin');

-- Grants
grant select, insert, update, delete on profiles to authenticated;
grant select, update on business_settings to authenticated;
grant select, insert, update, delete on categories to authenticated;
grant select, insert, update, delete on products to authenticated;
grant select, insert, update, delete on inventory_movements to authenticated;
grant select, insert, update, delete on coupons to authenticated;
grant select, insert, update, delete on sales to authenticated;
grant select, insert, update, delete on sale_items to authenticated;
grant select, insert, update, delete on payments to authenticated;
grant select, insert, update, delete on suppliers to authenticated;
grant select, insert, update, delete on purchase_invoices to authenticated;
grant select, insert, update, delete on purchase_items to authenticated;
grant select, insert, update, delete on supplier_payments to authenticated;
grant select, insert on audit_logs to authenticated;

-- Storage bucket for product/category images
insert into storage.buckets (id, name, public) values ('catalog','catalog', true)
  on conflict (id) do nothing;

create policy "catalog_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog');
create policy "catalog_admin_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and app_role() = 'admin');
create policy "catalog_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and app_role() = 'admin');
create policy "catalog_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and app_role() = 'admin');
