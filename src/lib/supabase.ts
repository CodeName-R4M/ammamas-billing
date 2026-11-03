import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const isSupabaseConfigured = Boolean(url && anon);

/**
 * The Supabase client is the app's only route to the database.
 * A real auth session is kept in local storage and refreshed automatically, so
 * every query/insert is made as the signed-in staff member (not anonymously).
 * Row Level Security decides what that member may read or write.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'alpha-supabase-session',
        // Run auth work directly instead of through the browser's Web Locks.
        // The Android WebView keeps a lock request pending forever after the
        // app is killed mid-refresh, which leaves getSession() hanging and the
        // app stuck on its loading spinner.
        lock: (_name, _acquireTimeout, fn) => fn(),
      },
    })
  : null;
