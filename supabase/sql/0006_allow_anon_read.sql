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
