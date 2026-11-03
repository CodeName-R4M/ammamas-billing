/*
# Version control (developer-owned, read-only in the app)

Plain-English summary
Versioning is split in two, and both numbers are owned by the developer:

  • App (frontend) version — the APP_VERSION constant in src/lib/version.ts.
    Bump it only when a new build of the app is released.
  • Backend version — `app_version_control.latest_version`, seeded below.
    Bump it here, in this migration, only when the backend changes.

On app start the frontend compares its build version against this row and, when
the backend is ahead, shows the "Update is available" dialogue once per session.

This script:
  1. Creates a single-row table `app_version_control` holding the backend
     version the app compares itself against, seeded with the current value.
  2. Makes that row readable by the public (anon) key so the app can check it
     BEFORE a user logs in.
  3. Leaves the row read-only for every app role — no admin write policy and no
     publish function — so neither an admin nor a cashier can change it. Only
     the developer changes the version, by editing this file and re-running it.

Safe to run again (idempotent). The seed re-asserts the developer's declared
backend version.
*/

-- 1. Single-row version registry -------------------------------------------------
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

-- Seed the current backend version. Re-running this file re-asserts it, so this
-- seed is the developer's single source of truth for the backend version.
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

-- keep updated_at fresh
drop trigger if exists trg_app_version_control_updated on app_version_control;
create trigger trg_app_version_control_updated before update on app_version_control
  for each row execute function set_updated_at();

-- 2. Access control --------------------------------------------------------------
alter table app_version_control enable row level security;

-- The app must read the published version before login -> allow public read.
drop policy if exists "app_version_read_all" on app_version_control;
create policy "app_version_read_all" on app_version_control
  for select to anon, authenticated using (true);

-- Developer-only: the row stays read-only for every app role. No admin write
-- policy and no write grants, so neither an admin nor a cashier can change the
-- version from inside the app. Only the developer edits this file.
drop policy if exists "app_version_admin_write" on app_version_control;
revoke insert, update, delete on app_version_control from anon, authenticated;
grant select on app_version_control to anon, authenticated;

-- Removed in favour of the developer-owned seed above.
drop function if exists publish_app_version(text, text, text, text, text, boolean, jsonb);

notify pgrst, 'reload schema';
