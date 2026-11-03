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
