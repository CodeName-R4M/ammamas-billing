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
