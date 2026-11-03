-- =====================================================================================
-- AMMAMAS BILLING — CONSOLIDATED DATABASE SETUP (idempotent)
-- =====================================================================================
-- Runs the whole schema in order: 0001 -> 0009.
-- Safe to run on a fresh project AND safe to re-run on a project that already has some
-- (or all) of the scripts applied. Nothing is dropped except RLS policies, which are
-- always rebuilt in the same script; no existing data is deleted.
--
-- Order and purpose
--   0001  initial schema (tables, indexes, set_updated_at trigger helper)
--   0002  first-pass RLS policies + catalog storage bucket
--   0003  seed catalog data (categories, products, coupons, suppliers, settings)
--   0004  access control rewrite — drops ALL policies, creates is_staff()/is_admin(),
--         drops the old app_role() helper, recreates the authoritative policy set
--   0005  permanent seeded admin account + staff management functions
--   0006  allow anonymous read of the catalog
--   0007  online-first POS RPCs (sale lifecycle, stock in/adjust)
--   0008  version control (developer-owned backend version, read-only in the app)
--   0009  business expansion (expenses, investments, customers, ad-hoc bill lines,
--         buyer ledger, staff insight RPCs)
--
-- Generated from supabase/migrations/* and supabase/sql/* — do not hand-edit; edit the
-- numbered scripts and regenerate.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Guard: drop existing RLS policies so the policy-creating sections below can re-run.
-- 0004 performs the same drop before building the authoritative policy set.
-- -------------------------------------------------------------------------------------
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

-- =====================================================================================
-- SECTION 0001 — INITIAL SCHEMA
-- source: 20261030070415_0001_initial_schema.sql
-- =====================================================================================
-- Ammamas Billing — initial schema
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
  business_name text not null default 'Ammamas Billing',
  logo_url text,
  phone text,
  address text,
  upi_id text not null default 'ammamas@upi',
  upi_name text not null default 'Ammamas Billing',
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


-- =====================================================================================
-- SECTION 0002 — RLS POLICIES (first pass)
-- source: 20261030070438_0002_rls_policies.sql
-- =====================================================================================
-- RLS policies for Ammamas Billing
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


-- =====================================================================================
-- SECTION 0003 — SEED CATALOG DATA
-- source: 20261030070456_0003_seed_data.sql
-- =====================================================================================
-- Seed data for Ammamas Billing
insert into business_settings (business_name, upi_id, upi_name, phone, address)
select 'Ammamas Billing','ammamas@upi','Ammamas Billing','+91 90000 12345','123 Market Street, Bangalore, KA 560001'
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


-- =====================================================================================
-- SECTION 0004 — ADMIN ACCESS CONTROL
-- source: 0004_admin_access_control.sql
-- =====================================================================================
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


-- =====================================================================================
-- SECTION 0005 — SEED ADMIN + STAFF MGMT
-- source: 0005_seed_admin_and_staff.sql
-- =====================================================================================
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
- Profile name: Ammamas Admin, role admin, active.

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
  '{"name":"Ammamas Admin"}'::jsonb,
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
  'Ammamas Admin',
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


-- =====================================================================================
-- SECTION 0006 — ALLOW ANON CATALOG READ
-- source: 0006_allow_anon_read.sql
-- =====================================================================================
/*
# Allow the app's public key to READ the catalog (read-only)

Plain-English summary
The app talks to Supabase using the public "anon" key and never signs a user in,
so every request runs as the anonymous (anon) role. Script
0004_admin_access_control.sql revoked all table access from anon, so the app
received "42501 permission denied for table categories" and could not load any
cloud data — it silently fell back to locally stored items only.

This script re-opens READ-ONLY access to the two catalog tables the app displays
(categories and products). Nothing else changes: writes, sales, staff, coupons
and audit data still require a signed-in staff/admin account.

Important notes
1. Run after 0004 and 0005.
2. Safe to run again: the policies are dropped and recreated, grants are restated.
3. No data is changed or removed.
4. Only categories and products become readable by the public app key. That is
   what a shared product catalog needs. Everything else stays private.
*/

-- Row Level Security: allow the anon role to read every row.
drop policy if exists "categories_select_anon" on categories;
create policy "categories_select_anon" on categories for select to anon
  using (true);

drop policy if exists "products_select_anon" on products;
create policy "products_select_anon" on products for select to anon
  using (true);

-- Table-level grants: RLS alone is not enough — the role also needs SELECT.
grant select on categories to anon;
grant select on products to anon;

-- Ask PostgREST to pick up the new grants/policies immediately.
notify pgrst, 'reload schema';


-- =====================================================================================
-- SECTION 0007 — ONLINE-FIRST POS RPCs
-- source: 0007_online_first_pos.sql
-- =====================================================================================
/*
# Online-first POS — Supabase as the single source of truth

Plain-English summary
Before this script the app kept sales, payments and stock only on the device, so the
UI could say "payment confirmed" while the database knew nothing about it. This script
adds server-side, atomic routines that write the whole transaction in one go.

Payment safety rules encoded here
- Showing a QR / opening the payment screen only records a PENDING payment
  ("a payment request was prepared"). It never marks anything as paid.
- Stock is deducted and money is recorded as received ONLY when a signed-in staff
  member explicitly confirms (the cashier tapping "Confirm"). There is no timeout,
  no automatic confirmation, and no path that reports success without a committed row.
- Confirming is idempotent: confirming an already-paid sale returns already_confirmed.

Functions added
- pos_begin_sale(items, method, coupon, confirm)  -> creates sale + items + payments (pending)
- pos_confirm_sale(sale_id, txn_ref)              -> marks paid, deducts stock, writes ledger
- pos_cancel_sale(sale_id, reason)                -> cancels an unconfirmed sale
- inv_stock_in(product_id, qty, unit_cost, ...)   -> admin stock-in (weighted-average cost)
- inv_adjust(product_id, qty, reason, type)       -> admin damage/expiry/correction

All of them are SECURITY DEFINER with a pinned search_path, re-check staff/admin
membership themselves, and are executable only by the authenticated role.

Important notes
1. Run after 0004/0005/0006.
2. Safe to run again: functions are replaced, the sequence is created only if missing.
3. Existing rows are never modified by this script.
*/

create sequence if not exists public.receipt_seq;

-- ---------------------------------------------------------------------------
-- Record the start of a sale. Everything is created as PENDING.
-- ---------------------------------------------------------------------------
create or replace function public.pos_begin_sale(
  p_items jsonb,                      -- [{"product_id": "<uuid>", "qty": 2}, ...]
  p_payment_method text,              -- 'cash' | 'upi'
  p_coupon_code text default null,
  p_confirm boolean default false     -- true = cashier confirmed receipt in the same call
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_sale_id uuid := gen_random_uuid();
  v_payment_id uuid := gen_random_uuid();
  v_receipt text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_tax_rate numeric(5,2) := 0;
  v_item record;
  v_prod record;
  v_line numeric(12,2);
  v_coupon public.coupons%rowtype;
  v_coupon_code text := null;
  v_result jsonb;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Sign-in required: only active staff can record sales' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in ('cash', 'upi') then
    raise exception 'Unsupported payment method: %', coalesce(p_payment_method, '(none)');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot record a sale with an empty bill';
  end if;

  select name into v_name from profiles where id = v_uid and active;
  v_name := coalesce(v_name, 'Cashier');

  select coalesce(tax_rate, 0) into v_tax_rate from business_settings limit 1;
  v_tax_rate := coalesce(v_tax_rate, 0);

  v_receipt := 'R' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.receipt_seq')::text, 4, '0');

  -- The sale header is written first so the line items satisfy their foreign key.
  -- Totals are filled in once every line has been priced.
  insert into sales (id, receipt_no, cashier_id, cashier_name, subtotal, discount, tax, total, coupon_code, payment_method, payment_status)
  values (v_sale_id, v_receipt, v_uid, v_name, 0, 0, 0, 0, null, p_payment_method, 'pending');

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty numeric)
  loop
    if v_item.product_id is null then
      raise exception 'The bill contains a line with no product';
    end if;
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception 'The bill contains an invalid quantity';
    end if;

    select id, name, selling_price, cost_price, stock, active
      into v_prod
      from products
     where id = v_item.product_id;

    if not found then
      raise exception 'A product in this bill no longer exists';
    end if;
    if not v_prod.active then
      raise exception 'Product "%" is no longer available', v_prod.name;
    end if;
    if v_prod.stock < v_item.qty then
      raise exception 'Insufficient stock for "%" (only % left)', v_prod.name, v_prod.stock;
    end if;

    v_line := round(v_prod.selling_price * v_item.qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into sale_items (id, sale_id, product_id, name, unit_price, cost_price, qty, line_total)
    values (gen_random_uuid(), v_sale_id, v_prod.id, v_prod.name, v_prod.selling_price, v_prod.cost_price, v_item.qty, v_line);
  end loop;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon from coupons where lower(code) = lower(btrim(p_coupon_code)) limit 1;

    if not found then
      raise exception 'Coupon "%" was not found', p_coupon_code;
    end if;
    if not v_coupon.active then
      raise exception 'Coupon "%" is not active', v_coupon.code;
    end if;
    if current_date < v_coupon.start_date then
      raise exception 'Coupon "%" is not valid yet', v_coupon.code;
    end if;
    if current_date > v_coupon.expiry_date then
      raise exception 'Coupon "%" has expired', v_coupon.code;
    end if;
    if v_subtotal < v_coupon.min_amount then
      raise exception 'Coupon "%" needs a minimum bill of %', v_coupon.code, v_coupon.min_amount;
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'Coupon "%" has reached its usage limit', v_coupon.code;
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
      if v_coupon.max_discount is not null then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(v_discount, v_subtotal);
    v_coupon_code := v_coupon.code;
  end if;

  v_tax := round(greatest(0, v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_total := round(greatest(0, v_subtotal - v_discount) + v_tax, 2);

  update sales
     set subtotal = v_subtotal,
         discount = v_discount,
         tax = v_tax,
         total = v_total,
         coupon_code = v_coupon_code
   where id = v_sale_id;

  insert into payments (id, sale_id, amount, payment_method, status, initiated_by, initiated_at)
  values (v_payment_id, v_sale_id, v_total, p_payment_method, 'pending', v_uid, now());

  if p_confirm then
    perform public.pos_confirm_sale(v_sale_id, null);
  end if;

  select to_jsonb(s) into v_result
    from (
      select id, receipt_no, payment_status, subtotal, discount, tax, total, coupon_code, created_at
        from sales where id = v_sale_id
    ) s;

  return v_result || jsonb_build_object('sale_id', v_sale_id, 'payment_id', v_payment_id);
end $$;

-- ---------------------------------------------------------------------------
-- The cashier confirms the money was received. Only here does stock move.
-- ---------------------------------------------------------------------------
create or replace function public.pos_confirm_sale(
  p_sale_id uuid,
  p_txn_ref text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item record;
  v_prod record;
  v_now timestamptz := now();
  v_ref text := nullif(btrim(coalesce(p_txn_ref, '')), '');
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Sign-in required: only active staff can confirm payments' using errcode = '42501';
  end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale % was not found', p_sale_id;
  end if;

  if not (v_sale.cashier_id = v_uid or public.is_admin()) then
    raise exception 'You can only confirm your own sales' using errcode = '42501';
  end if;

  if v_sale.payment_status = 'paid' then
    return jsonb_build_object(
      'ok', true, 'already_confirmed', true,
      'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no,
      'payment_status', 'paid', 'total', v_sale.total
    );
  end if;

  if v_sale.payment_status <> 'pending' then
    raise exception 'Sale % is % and cannot be confirmed', v_sale.receipt_no, v_sale.payment_status;
  end if;

  for v_item in select * from sale_items where sale_id = p_sale_id loop
    select id, name, stock into v_prod from products where id = v_item.product_id for update;

    if not found then
      raise exception 'Product "%" from this sale no longer exists', v_item.name;
    end if;
    if v_prod.stock < v_item.qty then
      raise exception 'Insufficient stock for "%" (only % left) — payment NOT confirmed', v_prod.name, v_prod.stock;
    end if;

    update products set stock = stock - v_item.qty where id = v_prod.id;

    insert into inventory_movements (id, product_id, movement_type, quantity, reason, reference_id, created_by, created_at)
    values (gen_random_uuid(), v_prod.id, 'sale', -v_item.qty, 'Sale ' || v_sale.receipt_no, v_sale.id, v_uid, v_now);
  end loop;

  update payments
     set status = 'paid',
         confirmed_by = v_uid,
         confirmed_at = v_now,
         txn_ref = coalesce(v_ref, txn_ref)
   where sale_id = p_sale_id and status = 'pending';

  update sales
     set payment_status = 'paid',
         txn_ref = coalesce(v_ref, txn_ref)
   where id = p_sale_id;

  if v_sale.coupon_code is not null then
    update coupons set used_count = used_count + 1 where lower(code) = lower(v_sale.coupon_code);
  end if;

  insert into audit_logs (id, actor_id, action, entity, entity_id, payload)
  values (gen_random_uuid(), v_uid, 'sale.confirm', 'sales', v_sale.id,
          jsonb_build_object('receipt_no', v_sale.receipt_no, 'total', v_sale.total,
                             'method', v_sale.payment_method, 'txn_ref', v_ref));

  return jsonb_build_object(
    'ok', true, 'already_confirmed', false,
    'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no,
    'payment_status', 'paid', 'total', v_sale.total
  );
end $$;

-- ---------------------------------------------------------------------------
-- Abandon an unconfirmed sale (e.g. customer walks away from the QR).
-- ---------------------------------------------------------------------------
create or replace function public.pos_cancel_sale(
  p_sale_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Sign-in required: only active staff can cancel sales' using errcode = '42501';
  end if;

  select * into v_sale from sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale % was not found', p_sale_id;
  end if;
  if not (v_sale.cashier_id = v_uid or public.is_admin()) then
    raise exception 'You can only cancel your own sales' using errcode = '42501';
  end if;
  if v_sale.payment_status = 'paid' then
    raise exception 'Sale % is already paid and cannot be cancelled', v_sale.receipt_no;
  end if;

  update sales set payment_status = 'cancelled' where id = p_sale_id;
  update payments set status = 'cancelled' where sale_id = p_sale_id and status = 'pending';

  insert into audit_logs (id, actor_id, action, entity, entity_id, payload)
  values (gen_random_uuid(), v_uid, 'sale.cancel', 'sales', v_sale.id, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'sale_id', v_sale.id, 'payment_status', 'cancelled');
end $$;

-- ---------------------------------------------------------------------------
-- Admin inventory writes (stock movements are append-only via these).
-- ---------------------------------------------------------------------------
create or replace function public.inv_stock_in(
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric default null,
  p_reason text default null,
  p_expiry_date date default null,
  p_batch_number text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prod public.products%rowtype;
  v_new_stock numeric(14,2);
  v_avg numeric(10,2);
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Admin sign-in required to record stock' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity received must be more than 0';
  end if;

  select * into v_prod from products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;

  v_new_stock := v_prod.stock + p_qty;
  v_avg := case
             when v_new_stock > 0 and p_unit_cost is not null
               then round((v_prod.stock * v_prod.cost_price + p_qty * p_unit_cost) / v_new_stock, 2)
             else v_prod.cost_price
           end;

  update products
     set stock = v_new_stock,
         cost_price = v_avg,
         expiry_date = coalesce(p_expiry_date, expiry_date),
         batch_number = coalesce(nullif(btrim(coalesce(p_batch_number, '')), ''), batch_number)
   where id = p_product_id;

  insert into inventory_movements (id, product_id, movement_type, quantity, reason, created_by)
  values (gen_random_uuid(), p_product_id, 'in', p_qty, p_reason, v_uid);

  insert into audit_logs (id, actor_id, action, entity, entity_id, payload)
  values (gen_random_uuid(), v_uid, 'inventory.stock_in', 'products', p_product_id,
          jsonb_build_object('qty', p_qty, 'unit_cost', p_unit_cost, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'product_id', p_product_id, 'stock', v_new_stock, 'cost_price', v_avg);
end $$;

create or replace function public.inv_adjust(
  p_product_id uuid,
  p_qty numeric,
  p_reason text,
  p_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prod public.products%rowtype;
  v_new numeric(14,2);
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Admin sign-in required to adjust stock' using errcode = '42501';
  end if;
  if p_type not in ('adjustment', 'expired', 'damaged') then
    raise exception 'Unsupported adjustment type: %', p_type;
  end if;
  if p_qty is null or p_qty = 0 then
    raise exception 'Enter a non-zero quantity';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  select * into v_prod from products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;

  v_new := v_prod.stock + p_qty;
  if v_new < 0 then
    raise exception 'Cannot remove more than the % currently in stock', v_prod.stock;
  end if;

  update products set stock = v_new where id = p_product_id;

  insert into inventory_movements (id, product_id, movement_type, quantity, reason, created_by)
  values (gen_random_uuid(), p_product_id, p_type, p_qty, p_reason, v_uid);

  insert into audit_logs (id, actor_id, action, entity, entity_id, payload)
  values (gen_random_uuid(), v_uid, 'inventory.adjust', 'products', p_product_id,
          jsonb_build_object('qty', p_qty, 'type', p_type, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'product_id', p_product_id, 'stock', v_new);
end $$;

-- ---------------------------------------------------------------------------
-- Lock down execution: authenticated staff only.
-- ---------------------------------------------------------------------------
revoke all on function public.pos_begin_sale(jsonb, text, text, boolean) from public, anon;
revoke all on function public.pos_confirm_sale(uuid, text) from public, anon;
revoke all on function public.pos_cancel_sale(uuid, text) from public, anon;
revoke all on function public.inv_stock_in(uuid, numeric, numeric, text, date, text) from public, anon;
revoke all on function public.inv_adjust(uuid, numeric, text, text) from public, anon;

grant execute on function public.pos_begin_sale(jsonb, text, text, boolean) to authenticated;
grant execute on function public.pos_confirm_sale(uuid, text) to authenticated;
grant execute on function public.pos_cancel_sale(uuid, text) to authenticated;
grant execute on function public.inv_stock_in(uuid, numeric, numeric, text, date, text) to authenticated;
grant execute on function public.inv_adjust(uuid, numeric, text, text) to authenticated;

grant usage on sequence public.receipt_seq to authenticated;


-- =====================================================================================
-- SECTION 0008 — APP VERSION CONTROL
-- source: 0008_app_version_control.sql
-- =====================================================================================
/*
# 0008 — Version control (developer-owned, read-only in the app)

Run after 0007. Idempotent and safe to run again.

Versioning is split in two, and both numbers are owned by the developer:

  • App (frontend) version — the APP_VERSION constant in src/lib/version.ts.
    Bump it only when a new build of the app is released.
  • Backend version — `app_version_control.latest_version`, seeded below.
    Bump it here, in this migration, only when the backend changes.

The app reads the backend version at startup and shows an update notice when
the backend version is ahead of the installed build. The row is read-only for
everyone in the app: neither an admin nor a cashier can change it — there is no
admin write policy and no publish function. To publish a new backend version,
edit the values below as the developer and re-run this file.
*/

create table if not exists app_version_control (
  id integer primary key default 1 check (id = 1),
  latest_version text not null,
  min_supported_version text not null default '1.0.0',
  update_title text,
  release_notes text,
  download_url text,
  developer_contact text,
  force_update boolean not null default false,
  changelog jsonb not null default '[]'::jsonb,
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The developer's declaration of the current backend version. Re-running this
-- file re-asserts it, so this seed is the single source of truth.
insert into app_version_control
  (id, latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog)
values
  (1, '1.0.1', '1.0.0', 'Update Available',
   'A new version of Ammamas Billing is available. Ask the developer for a new copy or download the latest version.',
   'https://personal-diary-ram.web.app', 'support@alphadigitronix.in', false,
   '["100% width edge-to-edge layout for phones","Red, Orange & White brand theme with official logo","Professional PDF/CSV export with logo","Automatic version-mismatch notice on app start"]'::jsonb)
on conflict (id) do update set
  latest_version        = excluded.latest_version,
  min_supported_version = excluded.min_supported_version,
  update_title          = excluded.update_title,
  release_notes         = excluded.release_notes,
  download_url          = excluded.download_url,
  developer_contact     = excluded.developer_contact,
  force_update          = excluded.force_update,
  changelog             = excluded.changelog;

drop trigger if exists trg_app_version_control_updated on app_version_control;
create trigger trg_app_version_control_updated before update on app_version_control
  for each row execute function set_updated_at();

alter table app_version_control enable row level security;

drop policy if exists "app_version_read_all" on app_version_control;
create policy "app_version_read_all" on app_version_control
  for select to anon, authenticated using (true);

drop policy if exists "app_version_admin_write" on app_version_control;
revoke insert, update, delete on app_version_control from anon, authenticated;
grant select on app_version_control to anon, authenticated;

-- Removed in favour of the developer-owned seed above.
drop function if exists publish_app_version(text, text, text, text, text, boolean, jsonb);

notify pgrst, 'reload schema';



-- =====================================================================================
-- SECTION 0009 — BUSINESS EXPANSION
-- source: 0009_business_expansion.sql
-- =====================================================================================
/*
# Business expansion: expenses, investments, buyers, ad-hoc bills, staff insight

Plain-English summary
This script adds the four new business modules and the two cashier helpers, without
changing anything that already works.

1. Expenses
   A new `expenses` table (rent, utilities, salary, misc) with an admin-only screen.
2. Investments / Capital
   A new `investments` table recording money put in, taken out and reinvested, so the
   app can show Net Capital = Total In - Total Withdrawn.
3. Buyers / Customers
   A new `customers` table (name, phone, location, notes). A sale can be attached to a
   buyer, which gives each buyer a running account ledger.
4. Ad-hoc (empty) bills
   `pos_begin_sale` now accepts lines that are not in the catalog (name + price + qty),
   which is how walk-in sales of unlisted items are billed. Catalog lines still check
   and move stock exactly as before.
5. Staff insight
   `admin_staff_overview()` returns last sign-in, bills and revenue per staff member.
   `admin_reset_staff_password()` lets an admin set a new password for a staff account.

Security
- `expenses` and `investments` are administrator-only (read and write).
- `customers` can be read and created by any active staff member (cashiers add buyers at
  the till); only administrators can edit or delete them.
- The catalogue tables and every other table keep their existing rules.
- `business_settings` becomes readable with the public app key so the shop name can be
  shown on the splash and login screens before a user signs in.

Important notes
1. Run after 0008. It is safe to run again: tables use "if not exists", policies and
   functions are dropped and recreated.
2. Existing sales, stock and payments are untouched.
3. The old 4-argument pos_begin_sale is dropped and replaced by the 5-argument version
   (it gains an optional buyer). The app calls it by name, so nothing else changes.
*/

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Expenses
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'misc',
  spent_on date not null default current_date,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on expenses(spent_on desc);
create index if not exists expenses_category_idx on expenses(category);

-- ---------------------------------------------------------------------------
-- 2. Investments / capital
-- ---------------------------------------------------------------------------
create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null default 'capital_in' check (type in ('capital_in', 'withdrawal', 'reinvestment')),
  entry_date date not null default current_date,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists investments_date_idx on investments(entry_date desc);
create index if not exists investments_type_idx on investments(type);

-- ---------------------------------------------------------------------------
-- 3. Buyers / customers
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  location text,
  notes text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_phone_idx on customers(phone);
create index if not exists customers_name_idx on customers(name);

-- A sale may be attached to a buyer. Existing sales keep customer_id = null.
alter table sales add column if not exists customer_id uuid references customers(id) on delete set null;
create index if not exists sales_customer_idx on sales(customer_id);

-- Ad-hoc lines are stored in sale_items with product_id = null (already allowed),
-- so reports can tell a catalogue line from a manually typed one.
alter table sale_items add column if not exists is_custom boolean not null default false;

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_expenses_updated on expenses;
create trigger trg_expenses_updated before update on expenses
  for each row execute function set_updated_at();

drop trigger if exists trg_investments_updated on investments;
create trigger trg_investments_updated before update on investments
  for each row execute function set_updated_at();

drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table expenses enable row level security;
alter table investments enable row level security;
alter table customers enable row level security;

-- Expenses: any active staff member can read, only administrators can change.
drop policy if exists "expenses_select_staff" on expenses;
create policy "expenses_select_staff" on expenses for select to authenticated
  using (public.is_staff());
drop policy if exists "expenses_insert_admin" on expenses;
create policy "expenses_insert_admin" on expenses for insert to authenticated
  with check (public.is_admin());
drop policy if exists "expenses_update_admin" on expenses;
create policy "expenses_update_admin" on expenses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "expenses_delete_admin" on expenses;
create policy "expenses_delete_admin" on expenses for delete to authenticated
  using (public.is_admin());

-- Investments: capital records are administrator-only.
drop policy if exists "investments_select_admin" on investments;
create policy "investments_select_admin" on investments for select to authenticated
  using (public.is_admin());
drop policy if exists "investments_insert_admin" on investments;
create policy "investments_insert_admin" on investments for insert to authenticated
  with check (public.is_admin());
drop policy if exists "investments_update_admin" on investments;
create policy "investments_update_admin" on investments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "investments_delete_admin" on investments;
create policy "investments_delete_admin" on investments for delete to authenticated
  using (public.is_admin());

-- Customers: cashiers may look up and add buyers at the till, admins manage them.
drop policy if exists "customers_select_staff" on customers;
create policy "customers_select_staff" on customers for select to authenticated
  using (public.is_staff());
drop policy if exists "customers_insert_staff" on customers;
create policy "customers_insert_staff" on customers for insert to authenticated
  with check (public.is_staff());
drop policy if exists "customers_update_admin" on customers;
create policy "customers_update_admin" on customers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "customers_delete_admin" on customers;
create policy "customers_delete_admin" on customers for delete to authenticated
  using (public.is_admin());

-- Table grants (RLS still decides which rows are visible).
grant select, insert, update, delete on expenses to authenticated;
grant select, insert, update, delete on investments to authenticated;
grant select, insert, update, delete on customers to authenticated;

-- The shop name / address / phone are printed on every receipt, so the app may read
-- them with the public key too. This lets the splash and login screens show the real
-- business name before anybody signs in.
drop policy if exists "business_settings_select_anon" on business_settings;
create policy "business_settings_select_anon" on business_settings for select to anon
  using (true);
grant select on business_settings to anon;

-- ---------------------------------------------------------------------------
-- 4. pos_begin_sale — catalog lines + ad-hoc lines + optional buyer
-- ---------------------------------------------------------------------------
drop function if exists public.pos_begin_sale(jsonb, text, text, boolean);

create or replace function public.pos_begin_sale(
  p_items jsonb,                      -- [{"product_id":"<uuid>","qty":2}, {"name":"Loose tea","unit_price":120,"qty":1}]
  p_payment_method text,              -- 'cash' | 'upi'
  p_coupon_code text default null,
  p_confirm boolean default false,    -- true = cashier confirmed receipt in the same call
  p_customer_id uuid default null     -- optional buyer attached to the bill
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_sale_id uuid := gen_random_uuid();
  v_payment_id uuid := gen_random_uuid();
  v_receipt text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_tax_rate numeric(5,2) := 0;
  v_item record;
  v_prod record;
  v_line numeric(12,2);
  v_custom_count int := 0;
  v_coupon public.coupons%rowtype;
  v_coupon_code text := null;
  v_customer uuid := null;
  v_result jsonb;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Sign-in required: only active staff can record sales' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in ('cash', 'upi') then
    raise exception 'Unsupported payment method: %', coalesce(p_payment_method, '(none)');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot record a sale with an empty bill';
  end if;

  select name into v_name from profiles where id = v_uid and active;
  v_name := coalesce(v_name, 'Cashier');

  select coalesce(tax_rate, 0) into v_tax_rate from business_settings limit 1;
  v_tax_rate := coalesce(v_tax_rate, 0);

  -- An attached buyer must exist. A blank id simply means "no buyer".
  if p_customer_id is not null then
    select id into v_customer from customers where id = p_customer_id;
    if v_customer is null then
      raise exception 'The selected buyer no longer exists';
    end if;
  end if;

  v_receipt := 'R' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.receipt_seq')::text, 4, '0');

  -- The sale header is written first so the line items satisfy their foreign key.
  -- Totals are filled in once every line has been priced.
  insert into sales (id, receipt_no, cashier_id, cashier_name, subtotal, discount, tax, total, coupon_code, payment_method, payment_status, customer_id)
  values (v_sale_id, v_receipt, v_uid, v_name, 0, 0, 0, 0, null, p_payment_method, 'pending', v_customer);

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, name text, unit_price numeric, qty numeric)
  loop
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception 'The bill contains an invalid quantity';
    end if;

    if v_item.product_id is null then
      -- Ad-hoc line: a walk-in item that is not in the catalogue. No stock moves.
      if v_item.name is null or btrim(v_item.name) = '' then
        raise exception 'A manually entered bill line needs a name';
      end if;
      if v_item.unit_price is null or v_item.unit_price < 0 then
        raise exception 'A manually entered bill line needs a valid price';
      end if;

      v_line := round(v_item.unit_price * v_item.qty, 2);
      v_subtotal := v_subtotal + v_line;
      v_custom_count := v_custom_count + 1;

      insert into sale_items (id, sale_id, product_id, name, unit_price, cost_price, qty, line_total, is_custom)
      values (gen_random_uuid(), v_sale_id, null, btrim(v_item.name), v_item.unit_price, 0, v_item.qty, v_line, true);
    else
      -- Catalogue line: price comes from the catalogue and stock must be available.
      select id, name, selling_price, cost_price, stock, active
        into v_prod
        from products
       where id = v_item.product_id;

      if not found then
        raise exception 'A product in this bill no longer exists';
      end if;
      if not v_prod.active then
        raise exception 'Product "%" is no longer available', v_prod.name;
      end if;
      if v_prod.stock < v_item.qty then
        raise exception 'Insufficient stock for "%" (only % left)', v_prod.name, v_prod.stock;
      end if;

      v_line := round(v_prod.selling_price * v_item.qty, 2);
      v_subtotal := v_subtotal + v_line;

      insert into sale_items (id, sale_id, product_id, name, unit_price, cost_price, qty, line_total, is_custom)
      values (gen_random_uuid(), v_sale_id, v_prod.id, v_prod.name, v_prod.selling_price, v_prod.cost_price, v_item.qty, v_line, false);
    end if;
  end loop;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon from coupons where lower(code) = lower(btrim(p_coupon_code)) limit 1;

    if not found then
      raise exception 'Coupon "%" was not found', p_coupon_code;
    end if;
    if not v_coupon.active then
      raise exception 'Coupon "%" is not active', v_coupon.code;
    end if;
    if current_date < v_coupon.start_date then
      raise exception 'Coupon "%" is not valid yet', v_coupon.code;
    end if;
    if current_date > v_coupon.expiry_date then
      raise exception 'Coupon "%" has expired', v_coupon.code;
    end if;
    if v_subtotal < v_coupon.min_amount then
      raise exception 'Coupon "%" needs a minimum bill of %', v_coupon.code, v_coupon.min_amount;
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'Coupon "%" has reached its usage limit', v_coupon.code;
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
      if v_coupon.max_discount is not null then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(v_discount, v_subtotal);
    v_coupon_code := v_coupon.code;
  end if;

  v_tax := round(greatest(0, v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_total := round(greatest(0, v_subtotal - v_discount) + v_tax, 2);

  update sales
     set subtotal = v_subtotal,
         discount = v_discount,
         tax = v_tax,
         total = v_total,
         coupon_code = v_coupon_code
   where id = v_sale_id;

  insert into payments (id, sale_id, amount, payment_method, status, initiated_by, initiated_at)
  values (v_payment_id, v_sale_id, v_total, p_payment_method, 'pending', v_uid, now());

  if p_confirm then
    perform public.pos_confirm_sale(v_sale_id, null);
  end if;

  select to_jsonb(s) into v_result
    from (
      select id, receipt_no, payment_status, subtotal, discount, tax, total, coupon_code, customer_id, created_at
        from sales where id = v_sale_id
    ) s;

  return v_result || jsonb_build_object(
    'sale_id', v_sale_id,
    'payment_id', v_payment_id,
    'custom_lines', v_custom_count
  );
end $$;

grant execute on function public.pos_begin_sale(jsonb, text, text, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Buyer ledger — one row per buyer with their running account totals
-- ---------------------------------------------------------------------------
create or replace function public.cust_summary()
returns table (
  customer_id uuid,
  customer_name text,
  phone text,
  location text,
  notes text,
  bill_count bigint,
  total_billed numeric,
  last_bill_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;

  return query
    select c.id,
           c.name,
           c.phone,
           c.location,
           c.notes,
           coalesce(agg.bill_count, 0)::bigint,
           coalesce(agg.total_billed, 0)::numeric,
           agg.last_bill_at
      from customers c
      left join (
        select s.customer_id,
               count(*) filter (where s.payment_status = 'paid') as bill_count,
               coalesce(sum(s.total) filter (where s.payment_status = 'paid'), 0) as total_billed,
               max(s.created_at) filter (where s.payment_status = 'paid') as last_bill_at
          from sales s
         where s.customer_id is not null
         group by s.customer_id
      ) agg on agg.customer_id = c.id
     order by coalesce(agg.total_billed, 0) desc, c.name;
end $$;

grant execute on function public.cust_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Staff insight — last sign-in, bills and revenue per staff member
-- ---------------------------------------------------------------------------
create or replace function public.admin_staff_overview()
returns table (
  staff_id uuid,
  staff_email text,
  staff_name text,
  staff_role text,
  staff_active boolean,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  bills_today bigint,
  bills_month bigint,
  bills_total bigint,
  revenue_month numeric,
  revenue_total numeric
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator sign-in required' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.email,
           p.name,
           p.role,
           p.active,
           p.created_at,
           u.last_sign_in_at,
           count(s.id) filter (where s.payment_status = 'paid' and s.created_at::date = current_date)::bigint,
           count(s.id) filter (
             where s.payment_status = 'paid'
               and date_trunc('month', s.created_at) = date_trunc('month', current_date)
           )::bigint,
           count(s.id) filter (where s.payment_status = 'paid')::bigint,
           coalesce(sum(s.total) filter (
             where s.payment_status = 'paid'
               and date_trunc('month', s.created_at) = date_trunc('month', current_date)
           ), 0)::numeric,
           coalesce(sum(s.total) filter (where s.payment_status = 'paid'), 0)::numeric
      from profiles p
      left join auth.users u on u.id = p.id
      left join sales s on s.cashier_id = p.id
     group by p.id, p.email, p.name, p.role, p.active, p.created_at, u.last_sign_in_at
     order by p.role, p.name;
end $$;

grant execute on function public.admin_staff_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Administrator password reset for a staff account
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_staff_password(
  p_user uuid,
  p_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Administrator sign-in required' using errcode = '42501';
  end if;

  if p_password is null or length(p_password) < 8 or length(p_password) > 72 then
    raise exception 'The new password must be between 8 and 72 characters';
  end if;

  select email into v_email from profiles where id = p_user;
  if v_email is null then
    raise exception 'That staff account could not be found';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
         updated_at = now()
   where id = p_user;

  insert into audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'STAFF_PASSWORD_RESET', 'profiles', p_user, jsonb_build_object('email', v_email));

  return jsonb_build_object('ok', true, 'email', v_email);
end $$;

grant execute on function public.admin_reset_staff_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
