import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AppUser, Role } from '@/types';

export interface SignInResult {
  ok: boolean;
  message: string;
  user?: AppUser;
}

interface AuthState {
  user: AppUser | null;
  /** False until the persisted Supabase session has been checked on start-up. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

/**
 * The role always comes from the staff profile table, never from the login form.
 * A signed-in account without an active profile is not staff and is rejected.
 */
async function loadProfile(authUserId: string, fallbackEmail: string): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, active')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.active) return null;

  return {
    id: data.id,
    email: data.email || fallbackEmail,
    name: data.name || fallbackEmail,
    role: data.role as Role,
  };
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  ready: false,

  signIn: async (email, password) => {
    if (!isSupabaseConfigured || !supabase) {
      return { ok: false, message: 'The cloud server is not configured — cannot sign in.' };
    }
    if (!email.trim() || !password) {
      return { ok: false, message: 'Enter your email and password.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, message: error.message };
    if (!data.user) return { ok: false, message: 'Sign-in failed — no user was returned.' };

    try {
      const profile = await loadProfile(data.user.id, data.user.email ?? email);
      if (!profile) {
        await supabase.auth.signOut();
        return { ok: false, message: 'This account has no active staff profile. Ask an administrator to activate it.' };
      }
      set({ user: profile, ready: true });
      return { ok: true, message: `Signed in as ${profile.name}`, user: profile };
    } catch (err) {
      await supabase.auth.signOut();
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  logout: async () => {
    set({ user: null });
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Already signed out — nothing to do.
      }
    }
  },

  restoreSession: async () => {
    if (!isSupabaseConfigured || !supabase) {
      set({ ready: true });
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        set({ user: null, ready: true });
        return;
      }
      const profile = await loadProfile(session.user.id, session.user.email ?? '');
      set({ user: profile, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
}));
