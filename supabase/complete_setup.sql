-- Alpha Digitronix Billing — initial schema
-- Profiles + business_settings
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'cashier' check (role in ('admin','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Alpha Digitronix Billing',
  logo_url text,
  phone text,
  address text,
  upi_id text not null default 'demo@alphaupi',
  upi_name text not null default 'Alpha Digitronix',
  tax_rate numeric(5,2) not null default 0,
  currency text not null default '₹',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catalog
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  name text not null,
  sku text not null unique,
  description text,
  image_url text,
  selling_price numeric(10,2) not null default 0 check (selling_price >= 0),
  cost_price numeric(10,2) not null default 0 check (cost_price >= 0),
  unit text not null default 'pcs',
  stock numeric(14,2) not null default 0 check (stock >= 0),
  low_stock_threshold numeric(14,2) not null default 0,
  expiry_date date,
  batch_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on products(category_id);
create index if not exists products_name_idx on products(name);
create index if not exists products_sku_idx on products(sku);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  movement_type text not null check (movement_type in ('in','out','adjustment','sale','expired','damaged')),
  quantity numeric(14,2) not null,
  reason text,
  reference_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inv_product_idx on inventory_movements(product_id);

-- Coupons
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null check (discount_value >= 0),
  min_amount numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  start_date date not null default current_date,
  expiry_date date not null default current_date + interval '30 days',
  usage_limit int,
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sales
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  cashier_id uuid references profiles(id) on delete set null,
  cashier_name text not null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  coupon_code text,
  payment_method text not null check (payment_method in ('cash','upi')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','refunded')),
  txn_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_created_idx on sales(created_at desc);
create index if not exists sales_status_idx on sales(payment_status);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  unit_price numeric(10,2) not null,
  cost_price numeric(10,2) not null default 0,
  qty numeric(14,2) not null check (qty > 0),
  line_total numeric(12,2) not null
);
create index if not exists sale_items_sale_idx on sale_items(sale_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null check (payment_method in ('cash','upi')),
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  txn_ref text,
  initiated_by uuid references profiles(id),
  confirmed_by uuid references profiles(id),
  initiated_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists payments_sale_idx on payments(sale_id);

-- Suppliers & purchases
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  invoice_no text not null,
  invoice_date date not null default current_date,
  due_date date,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','overdue'))
);
create index if not exists purchases_supplier_idx on purchase_invoices(supplier_id);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  qty numeric(14,2) not null check (qty > 0),
  unit_cost numeric(10,2) not null check (unit_cost >= 0)
);

create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  notes text
);

-- Audit
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Updated_at triggers
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array['profiles','business_settings','categories','products','coupons','sales','suppliers','purchase_invoices'])
  loop
    execute format(
      'drop trigger if exists trg_%s_updated on %I; create trigger trg_%s_updated before update on %I for each row execute function set_updated_at();',
      t, t, t, t);
  end loop;
end$$;
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
-- Seed data for Alpha Digitronix Billing
insert into business_settings (business_name, upi_id, upi_name, phone, address)
select 'Alpha Digitronix Billing','demo@alphaupi','Alpha Digitronix','+91 90000 12345','123 Market Street, Bangalore, KA 560001'
where not exists (select 1 from business_settings);

insert into categories (name, description, display_order, active) values
  ('Snacks','Crisps, namkeen and savoury snacks',1,true),
  ('Pickles','Traditional homemade pickles',2,true),
  ('Spice Powders','Ground spices and masalas',3,true),
  ('Ghee & Oils','Ghee, cooking oils and dressings',4,true),
  ('Traditional Products','Heritage and regional specialities',5,true),
  ('Fryums & Ready-to-Fry','Ready-to-fry snacks and papads',6,true)
on conflict do nothing;

insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Mixed Namkeen','SNK-001',120,78,'500g',40,10,null from categories c where c.name='Snacks'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Banana Chips','SNK-002',90,55,'250g',25,8,null from categories c where c.name='Snacks'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Spicy Murukku','SNK-003',60,38,'200g',4,10,date '2026-08-15' from categories c where c.name='Snacks'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Hot Samosa','SNK-005',30,15,'2 pcs',50,10,null from categories c where c.name='Snacks'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Mango Pickle','PKL-001',140,92,'400g',30,8,null from categories c where c.name='Pickles'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Garam Masala','SPC-001',110,70,'200g',18,6,null from categories c where c.name='Spice Powders'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Cow Ghee','GHE-001',520,420,'500ml',15,4,null from categories c where c.name='Ghee & Oils'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Mysore Pak','TRD-001',220,150,'250g',14,6,date '2026-06-30' from categories c where c.name='Traditional Products'
on conflict do nothing;
insert into products (category_id, name, sku, selling_price, cost_price, unit, stock, low_stock_threshold, expiry_date)
select c.id, 'Papad Plain','FRY-001',50,32,'200g',50,12,null from categories c where c.name='Fryums & Ready-to-Fry'
on conflict do nothing;

insert into coupons (code, discount_type, discount_value, min_amount, max_discount, start_date, expiry_date, usage_limit, used_count, active) values
  ('SAVE50','fixed',50,500,null,date '2026-01-01',date '2026-12-31',null,0,true),
  ('WELCOME10','percentage',10,200,100,date '2026-01-01',date '2026-12-31',100,3,true),
  ('FESTIVE25','percentage',25,1000,250,date '2026-10-01',date '2026-11-15',50,12,true)
on conflict (code) do nothing;

insert into suppliers (name, contact_person, phone, email, address, notes, active) values
  ('Spice Garden Traders','Ramesh','9876543210','sales@spicegarden.in','Mysore','Primary spice supplier',true),
  ('Heritage Foods','Lakshmi','9123456780','orders@heritagefoods.in','Bangalore','Ghee and oils',true),
  ('Snack World','Karthik','9001122334','hello@snackworld.in','Coimbatore',null,true)
on conflict do nothing;
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
/*
# Seed permanent admin and staff management

Plain-English summary
This script creates the first administrator account and gives admins a set of
secure actions for managing staff. The seeded admin cannot be deleted, demoted,
deactivated or have its login email changed. Admins can create cashier and
admin accounts, change roles, deactivate and reactivate accounts, and delete
accounts that have no recorded activity.

1. Seeded Admin Account
- Email: admin.alphadigitronix@gmail.com
- Password: admin@12123 (change it after the first sign-in)
- Email is already confirmed, so the account can sign in immediately.
- Profile name: Alpha Digitronix Admin, role admin, active.

2. New Functions
- `is_seed_admin(id)` tells whether an id is the permanent seeded admin.
- `admin_create_staff(email, password, name, role)` creates a login account and
  staff profile. Passwords must be 8 to 72 characters. Role must be admin or cashier.
- `admin_set_staff_role(user, role)` changes a staff member between admin and cashier.
- `admin_set_staff_active(user, active)` deactivates or reactivates an account.
  Deactivated accounts are also blocked from signing in.
- `admin_delete_staff(user)` permanently removes an account. It is refused when the
  account has sales, stock movements, payments or audit history, so records stay
  attributable. Deactivate those accounts instead.
- Every staff change is written to the audit log.

3. Protection Triggers
- The seeded admin's profile cannot be deleted, cannot change away from admin, and
  cannot be deactivated.
- The seeded admin's login account cannot be deleted, banned, or have its email changed.
- These protections apply to every path (app, dashboard, SQL editor).

4. Security
- All staff functions check that the caller is an active admin.
- Functions run with a fixed search path and are callable only by signed-in users.
- Direct writes to profiles remain blocked (set in the previous script).

Important notes
1. Run this script after the access control script (0004).
2. It is safe to run again: the seeded admin is only created if missing.
3. The seeded password is stored in this file as plain text. Change it after the first
   sign-in and delete this password from the file in your repository.
4. Public sign-ups should be turned off in the Supabase dashboard (Authentication, Sign In / Providers).
   Accounts without a staff profile cannot use the app's data either way.
*/

set search_path = public, extensions;

create or replace function public.is_seed_admin(p_id uuid)
returns boolean
language sql
immutable
as $$
  select p_id = '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b'::uuid;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b'::uuid,
  coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000'::uuid),
  'authenticated',
  'authenticated',
  'admin.alphadigitronix@gmail.com',
  crypt('admin@12123', gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
  '{"name":"Alpha Digitronix Admin"}'::jsonb,
  now(),
  now(),
  '', '', '', ''
where not exists (
  select 1 from auth.users
  where id = '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b'::uuid
     or lower(email) = 'admin.alphadigitronix@gmail.com'
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  gen_random_uuid(),
  '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b'::uuid,
  '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b',
  'email',
  jsonb_build_object(
    'sub', '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b',
    'email', 'admin.alphadigitronix@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  now(),
  now(),
  null
)
on conflict do nothing;

insert into profiles (id, email, name, role, active)
values (
  '6f1c2a8e-3b4d-4e5f-9a1b-7c8d9e0f1a2b',
  'admin.alphadigitronix@gmail.com',
  'Alpha Digitronix Admin',
  'admin',
  true
)
on conflict (id) do nothing;

create or replace function public.guard_seed_admin_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.is_seed_admin(old.id) then
      raise exception 'The seeded admin account is permanent and cannot be deleted';
    end if;
    return old;
  end if;

  if public.is_seed_admin(old.id)
     and (new.id <> old.id or new.role <> 'admin' or new.active = false) then
    raise exception 'The seeded admin account is permanent: it must stay an active admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_seed_admin on profiles;
create trigger trg_profiles_guard_seed_admin
before update or delete on profiles
for each row execute function public.guard_seed_admin_profile();

create or replace function public.guard_seed_admin_auth_user()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.is_seed_admin(old.id) then
      raise exception 'The seeded admin account is permanent and cannot be deleted';
    end if;
    return old;
  end if;

  if public.is_seed_admin(old.id)
     and (new.email is distinct from old.email
          or (new.banned_until is not null and new.banned_until > now())) then
    raise exception 'The seeded admin account is permanent: its email cannot change and it cannot be banned';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auth_users_guard_seed_admin on auth.users;
create trigger trg_auth_users_guard_seed_admin
before update or delete on auth.users
for each row execute function public.guard_seed_admin_auth_user();

create or replace function public.admin_create_staff(
  p_email text,
  p_password text,
  p_name text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage staff accounts';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if length(coalesce(p_password, '')) < 8 or length(p_password) > 72 then
    raise exception 'Password must be between 8 and 72 characters';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Enter a name up to 100 characters';
  end if;
  if p_role not in ('admin', 'cashier') then
    raise exception 'Role must be admin or cashier';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'An account with this email already exists';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    v_id,
    coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000'::uuid),
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf', 10)),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('name', v_name),
    now(),
    now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (
    gen_random_uuid(),
    v_id,
    v_id::text,
    'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(),
    now()
  );

  insert into profiles (id, email, name, role, active)
  values (v_id, v_email, v_name, p_role, true);

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'staff.create', 'profiles', v_id,
          jsonb_build_object('email', v_email, 'role', p_role));

  return v_id;
end;
$$;

create or replace function public.admin_set_staff_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage staff accounts';
  end if;
  if p_role not in ('admin', 'cashier') then
    raise exception 'Role must be admin or cashier';
  end if;

  update profiles set role = p_role where id = p_user;
  if not found then
    raise exception 'Staff account not found';
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'staff.role_change', 'profiles', p_user, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_set_staff_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage staff accounts';
  end if;

  update profiles set active = p_active where id = p_user;
  if not found then
    raise exception 'Staff account not found';
  end if;

  update auth.users
  set banned_until = case when p_active then null else 'infinity'::timestamptz end
  where id = p_user;

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_active then 'staff.activate' else 'staff.deactivate' end,
          'profiles', p_user, null);
end;
$$;

create or replace function public.admin_delete_staff(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage staff accounts';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  if public.is_seed_admin(p_user) then
    raise exception 'The seeded admin account is permanent and cannot be deleted';
  end if;
  if exists (select 1 from sales where cashier_id = p_user)
     or exists (select 1 from inventory_movements where created_by = p_user)
     or exists (select 1 from payments where initiated_by = p_user or confirmed_by = p_user)
     or exists (select 1 from audit_logs where actor_id = p_user) then
    raise exception 'This account has sales or activity history. Deactivate it instead to keep records intact';
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'staff.delete', 'profiles', p_user, null);

  delete from auth.users where id = p_user;
  if not found then
    raise exception 'Staff account not found';
  end if;
end;
$$;

revoke execute on function public.admin_create_staff(text, text, text, text) from public, anon;
revoke execute on function public.admin_set_staff_role(uuid, text) from public, anon;
revoke execute on function public.admin_set_staff_active(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_staff(uuid) from public, anon;
grant execute on function public.admin_create_staff(text, text, text, text) to authenticated;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_staff(uuid) to authenticated;
