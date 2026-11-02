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
