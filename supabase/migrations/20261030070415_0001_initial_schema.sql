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
