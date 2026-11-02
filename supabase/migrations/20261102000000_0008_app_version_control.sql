/*
# App version control (backend-driven version negotiation)

Plain-English summary
The POS app ships with a baked-in build version. When the developer wants to
force/recommend an update, the backend publishes a newer version here. On app
start the frontend compares its build version against this row and, if they
differ, shows the "Update is available" dialogue once per session.

This script:
  1. Creates a single-row table `app_version_control` holding the version the
     backend currently advertises.
  2. Makes that row readable by the public (anon) key so the app can check it
     BEFORE a user logs in.
  3. Restricts writes to admins and provides `publish_app_version(...)` — the
     one call the developer makes to publish a new release. It also writes an
     audit_logs entry (action = 'APP_VERSION_UPDATE').

Safe to run again (idempotent). No existing data is changed or removed.
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

-- Seed the current release so the app starts in sync (no false "update" popup).
insert into app_version_control
  (id, latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog)
values
  (1, '1.0.0', '1.0.0', 'Update Available',
   'A new version of Ammamas Billing is available. Ask the developer for a new copy or download the latest version.',
   'https://personal-diary-ram.web.app', 'support@alphadigitronix.in', false,
   '["100% width edge-to-edge layout for phones","Red, Orange & White brand theme with official logo","Professional PDF/CSV export with logo","Automatic version-mismatch notice on app start"]'::jsonb)
on conflict (id) do nothing;

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

-- Only admins may modify the row through direct table access.
drop policy if exists "app_version_admin_write" on app_version_control;
create policy "app_version_admin_write" on app_version_control
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on app_version_control to anon, authenticated;
grant insert, update, delete on app_version_control to authenticated;

-- 3. Publish helper (admin only) -------------------------------------------------
create or replace function publish_app_version(
  p_latest_version text,
  p_min_supported text default null,
  p_title text default null,
  p_notes text default null,
  p_download_url text default null,
  p_force boolean default false,
  p_changelog jsonb default '[]'::jsonb
) returns app_version_control
language plpgsql security definer set search_path = public as $$
declare
  v_row app_version_control;
  v_uid uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish an app version';
  end if;

  update app_version_control set
    latest_version        = p_latest_version,
    min_supported_version = coalesce(p_min_supported, min_supported_version),
    update_title          = coalesce(p_title, update_title),
    release_notes         = coalesce(p_notes, release_notes),
    download_url          = coalesce(p_download_url, download_url),
    force_update          = coalesce(p_force, false),
    changelog             = coalesce(p_changelog, '[]'::jsonb),
    published_by          = v_uid,
    published_at          = now()
  where id = 1
  returning * into v_row;

  insert into audit_logs (actor_id, action, entity, payload)
  values (
    v_uid, 'APP_VERSION_UPDATE', 'app_version_control',
    jsonb_build_object(
      'latest_version', p_latest_version,
      'min_supported_version', p_min_supported,
      'title', p_title,
      'release_notes', p_notes,
      'download_url', p_download_url,
      'force_update', p_force,
      'changelog', p_changelog
    )
  );

  return v_row;
end;
$$;

grant execute on function publish_app_version(text, text, text, text, text, boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
