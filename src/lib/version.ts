import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Version advertised by THIS build. Bump this together with the backend
 * (`publish_app_version` RPC / public/version.json) whenever you ship a release.
 */
export const CURRENT_FRONTEND_VERSION = '1.0.0';
export const APP_BUILD_DATE = '2026-11-02';

export interface AppVersionInfo {
  version: string;
  minSupportedVersion?: string;
  releaseDate?: string;
  updateTitle?: string;
  updateMessage?: string;
  downloadUrl?: string;
  developerContact?: string;
  forceUpdate?: boolean;
  changelog?: string[];
}

export interface VersionCheckResult {
  mismatch: boolean;
  currentVersion: string;
  backendVersion: string;
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
  published_at: string | null;
}

/**
 * Resolves the version the backend currently advertises, in priority order:
 *   1. Supabase `app_version_control` (live, anon-readable — works before login)
 *   2. `/version.json` shipped with the hosting deploy (static fallback)
 *   3. Legacy `audit_logs.APP_VERSION_UPDATE` entries
 */
export async function fetchBackendVersionInfo(): Promise<AppVersionInfo | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('app_version_control')
        .select(
          'latest_version, min_supported_version, update_title, release_notes, download_url, developer_contact, force_update, changelog, published_at',
        )
        .eq('id', 1)
        .maybeSingle();

      const row = data as VersionRow | null;
      if (row?.latest_version) {
        return {
          version: String(row.latest_version),
          minSupportedVersion: row.min_supported_version ?? undefined,
          updateTitle: row.update_title ?? undefined,
          updateMessage: row.release_notes ?? undefined,
          downloadUrl: row.download_url ?? undefined,
          developerContact: row.developer_contact ?? undefined,
          forceUpdate: Boolean(row.force_update),
          releaseDate: row.published_at ? String(row.published_at).slice(0, 10) : undefined,
          changelog: Array.isArray(row.changelog) ? (row.changelog as string[]) : undefined,
        };
      }
    } catch (err) {
      console.warn('Could not read app_version_control from backend:', err);
    }
  }

  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      const info = (await res.json()) as AppVersionInfo;
      if (info?.version) return info;
    }
  } catch (err) {
    console.warn('Could not fetch /version.json from hosting backend:', err);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('audit_logs')
        .select('payload, created_at')
        .eq('action', 'APP_VERSION_UPDATE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.payload) {
        const payload = data.payload as Record<string, unknown>;
        if (payload.latest_version) {
          return {
            version: String(payload.latest_version),
            minSupportedVersion: payload.min_supported_version ? String(payload.min_supported_version) : undefined,
            updateTitle: payload.title ? String(payload.title) : undefined,
            updateMessage: payload.release_notes ? String(payload.release_notes) : undefined,
            downloadUrl: payload.download_url ? String(payload.download_url) : undefined,
            forceUpdate: Boolean(payload.force_update),
            releaseDate: String(data.created_at).slice(0, 10),
            changelog: Array.isArray(payload.changelog) ? (payload.changelog as string[]) : undefined,
          };
        }
      }
    } catch {
      // Supabase audit check is supplementary
    }
  }

  return null;
}

/**
 * Compares the running frontend against the backend version.
 * `shouldNotify` is true only once per app session (sessionStorage flag).
 */
export async function checkBackendVersion(): Promise<VersionCheckResult | null> {
  const backendInfo = await fetchBackendVersionInfo();
  if (!backendInfo || !backendInfo.version) return null;

  const mismatch = backendInfo.version !== CURRENT_FRONTEND_VERSION;
  const alreadySeenInSession = Boolean(sessionStorage.getItem(SESSION_KEY));

  return {
    mismatch,
    currentVersion: CURRENT_FRONTEND_VERSION,
    backendVersion: backendInfo.version,
    info: backendInfo,
    shouldNotify: mismatch && !alreadySeenInSession,
  };
}

/**
 * Records that the update dialogue was presented in the current session.
 * Re-opening or restarting the app opens a new session where sessionStorage is clear.
 */
export function markUpdateDialogSeen(): void {
  sessionStorage.setItem(SESSION_KEY, 'true');
}

/**
 * Resets the session flag (useful for testing from the Admin console).
 */
export function resetUpdateDialogSessionFlag(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
