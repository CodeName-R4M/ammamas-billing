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
edit the values below as the developer and re-run this file (or apply_all.sql).
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

-- Public read so even an old copy of the app can check the version before login.
drop policy if exists "app_version_read_all" on app_version_control;
create policy "app_version_read_all" on app_version_control
  for select to anon, authenticated using (true);

-- Developer-only: no write policy and no write grants for any app role, so the
-- version can never be changed by an admin or a cashier from inside the app.
drop policy if exists "app_version_admin_write" on app_version_control;
revoke insert, update, delete on app_version_control from anon, authenticated;
grant select on app_version_control to anon, authenticated;

-- Removed in favour of the developer-owned seed above.
drop function if exists publish_app_version(text, text, text, text, text, boolean, jsonb);

notify pgrst, 'reload schema';
