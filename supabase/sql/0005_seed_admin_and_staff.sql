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
