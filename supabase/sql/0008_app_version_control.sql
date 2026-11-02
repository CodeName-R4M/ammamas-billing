/*
# 0008 — App version control (backend-driven version negotiation)

Run after 0007. Idempotent and safe to run again.
Publishes the version the app compares itself against at startup.

To publish an update later, as an admin call:
  select publish_app_version(
    '1.0.1',
    '1.0.0',
    'Update Available',
    'Bug fixes and improvements.',
    'https://personal-diary-ram.web.app',
    false,
    '["Fix: ...","New: ..."]'::jsonb
  );
Then bump CURRENT_FRONTEND_VERSION in src/lib/version.ts + public/version.json for
the next build, and also update public/version.json in the hosting deploy.
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

insert into app_version_control
  (id, latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog)
values
  (1, '1.0.0', '1.0.0', 'Update Available',
   'A new version of Ammamas Billing is available. Ask the developer for a new copy or download the latest version.',
   'https://personal-diary-ram.web.app', 'support@alphadigitronix.in', false,
   '["100% width edge-to-edge layout for phones","Red, Orange & White brand theme with official logo","Professional PDF/CSV export with logo","Automatic version-mismatch notice on app start"]'::jsonb)
on conflict (id) do nothing;

drop trigger if exists trg_app_version_control_updated on app_version_control;
create trigger trg_app_version_control_updated before update on app_version_control
  for each row execute function set_updated_at();

alter table app_version_control enable row level security;

drop policy if exists "app_version_read_all" on app_version_control;
create policy "app_version_read_all" on app_version_control
  for select to anon, authenticated using (true);

drop policy if exists "app_version_admin_write" on app_version_control;
create policy "app_version_admin_write" on app_version_control
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on app_version_control to anon, authenticated;
grant insert, update, delete on app_version_control to authenticated;

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
