import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Versioning lives in the .env files — edit VITE_APP_VERSION and
 * VITE_BACKEND_VERSION there and rebuild to ship. Nothing in the app can change
 * them: neither an admin nor a cashier has an editable field for them.
 *
 *   • VITE_APP_VERSION     → version of this frontend build.
 *   • VITE_BACKEND_VERSION → version of the backend this build talks to.
 *
 * The app shows a read-only update notice whenever the backend version is ahead
 * of the app version.
 */
const env = (value: string | undefined, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const APP_VERSION = env(import.meta.env.VITE_APP_VERSION, '1.0.0');
export const BACKEND_VERSION = env(import.meta.env.VITE_BACKEND_VERSION, '1.0.1');
export const APP_BUILD_DATE = env(import.meta.env.VITE_BUILD_DATE, '2026-11-02');

export interface AppVersionInfo {
  version: string;
  minSupportedVersion?: string;
  updateTitle?: string;
  updateMessage?: string;
  downloadUrl?: string;
  developerContact?: string;
  forceUpdate?: boolean;
  changelog?: string[];
}

export interface VersionCheckResult {
  mismatch: boolean;
  info: AppVersionInfo;
  shouldNotify: boolean;
}

const SESSION_KEY = 'ammamas_version_dialog_seen';

interface VersionRow {
  latest_version: string;
  min_supported_version: string | null;
  update_title: string | null;
  release_notes: string | null;
  download_url: string | null;
  developer_contact: string | null;
  force_update: boolean | null;
  changelog: unknown;
}

/** True when `candidate` is a newer dotted version than `current`. */
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

/** True when the advertised backend version is ahead of this build. */
export function isAppOutdated(backendVersion: string): boolean {
  return isNewer(backendVersion, APP_VERSION);
}

/**
 * Reads the version the backend currently advertises. The row is public-read so
 * an old copy of the app can still see it, and read-only for everyone in the app.
 */
export async function fetchBackendVersionInfo(): Promise<AppVersionInfo | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase
      .from('app_version_control')
      .select(
        'latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog',
      )
      .eq('id', 1)
      .maybeSingle();

    const row = data as VersionRow | null;
    if (!row?.latest_version) return null;

    return {
      version: String(row.latest_version),
      minSupportedVersion: row.min_supported_version ?? undefined,
      updateTitle: row.update_title ?? undefined,
      updateMessage: row.release_notes ?? undefined,
      downloadUrl: row.download_url ?? undefined,
      developerContact: row.developer_contact ?? undefined,
      forceUpdate: Boolean(row.force_update),
      changelog: Array.isArray(row.changelog) ? (row.changelog as string[]) : undefined,
    };
  } catch (err) {
    console.warn('Could not read app_version_control from the backend:', err);
    return null;
  }
}

/**
 * Compares this build against the backend. The declared backend version comes
 * from .env; the live `app_version_control` row, when reachable, only makes the
 * notice more accurate by carrying the release notes and download link.
 */
export async function checkBackendVersion(): Promise<VersionCheckResult | null> {
  const live = await fetchBackendVersionInfo();

  // Warn when either the declared backend version or the live server is ahead.
  const advertised = live && isNewer(live.version, BACKEND_VERSION) ? live.version : BACKEND_VERSION;
  const mismatch = isAppOutdated(advertised);
  const info: AppVersionInfo = { ...(live ?? {}), version: advertised };

  return {
    mismatch,
    info,
    shouldNotify: mismatch && !sessionStorage.getItem(SESSION_KEY),
  };
}

/** Records that the notice was shown in this session. */
export function markUpdateDialogSeen(): void {
  sessionStorage.setItem(SESSION_KEY, 'true');
}
